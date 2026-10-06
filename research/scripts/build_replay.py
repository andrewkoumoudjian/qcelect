"""Offline pseudo-live snapshots from real historical units, on validated 2026 boundaries."""
from pathlib import Path
import argparse
import hashlib
import json
import math
import pandas as pd
from qcelect_research.transposition import transpose_results

ROOT = Path(__file__).resolve().parents[2]
DATES = {2014: "2014-04-07", 2018: "2018-10-01", 2022: "2022-10-03"}

def historical_units(source, allocations):
    """Retain zero-vote units in reporting; fail if allocation omitted any votes."""
    units = source[["riding_code", "polling_section"]].drop_duplicates().rename(columns={"riding_code": "source_riding"})
    allocated = {(int(r), str(p)) for r, p in allocations[["source_riding", "polling_section"]].itertuples(index=False, name=None)}
    missing = [(int(r), str(p)) for r, p in units.itertuples(index=False, name=None) if (int(r), str(p)) not in allocated]
    totals = source.groupby(["riding_code", "polling_section"]).votes.sum()
    totals.index = pd.MultiIndex.from_tuples([(int(r), str(p)) for r, p in totals.index])
    if any(totals.loc[unit] != 0 for unit in missing):
        raise ValueError("unallocated historical units contain votes")
    return units, missing

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--election", type=int, choices=list(DATES), required=True)
    parser.add_argument("--reporting", type=float, required=True)
    parser.add_argument("--seed", type=int, default=2026)
    args = parser.parse_args()
    if not 0 <= args.reporting <= 100:
        raise ValueError("reporting must be between zero and 100")
    date = DATES[args.election]
    folder = ROOT / "data/generated/replay"
    folder.mkdir(parents=True, exist_ok=True)
    source_path = ROOT / "data/generated/historical/results_long.csv.gz"
    crosswalk_path = ROOT / f"data/generated/transposition/{args.election}-crosswalk.csv.gz"
    source_hash = hashlib.sha256(source_path.read_bytes()).hexdigest()
    crosswalk_hash = hashlib.sha256(crosswalk_path.read_bytes()).hexdigest()
    cache = folder / f"allocations-{args.election}-{source_hash[:12]}-{crosswalk_hash[:12]}.csv.gz"
    source = pd.read_csv(source_path, dtype={"polling_section":str})
    source = source[source.election == date].copy()
    if cache.exists():
        allocations = pd.read_csv(cache, dtype={"polling_section":str})
    else:
        result = transpose_results(source, None, None, crosswalk=pd.read_csv(crosswalk_path, dtype={"polling_section":str}))
        allocations = result.allocations
        # The replay cache must reproduce the already validated final transposition.
        actual = allocations.groupby(["target_riding", "party"]).votes.sum()
        expected = pd.read_csv(ROOT / f"data/generated/transposition/{args.election}-on-2026.csv.gz").groupby(["target_riding", "party"]).votes.sum()
        actual.index = pd.MultiIndex.from_tuples([(int(r),p) for r,p in actual.index])
        if not actual.sort_index().equals(expected.sort_index()):
            raise ValueError("replay allocations differ from validated final party/riding totals")
        allocations.to_csv(cache, index=False, compression="gzip")
    units, missing = historical_units(source, allocations)
    ordered = sorted([(int(r),str(p)) for r,p in units.itertuples(index=False, name=None)],
        key=lambda unit: hashlib.sha256(f"{args.seed}:{unit[0]}:{unit[1]}".encode()).digest())
    count = math.floor(len(ordered) * args.reporting / 100)
    selected = set(ordered[:count])
    observations = allocations[[ (int(r),str(p)) in selected for r,p in zip(allocations.source_riding, allocations.polling_section) ]]
    metadata = json.loads((ROOT / "data/ridings-2026.json").read_text())
    parties = sorted(allocations.party.unique())
    party_ids = {party:i+1 for i,party in enumerate(parties)}
    timestamp = f"{date}T23:00:00.000Z"
    ridings=[]
    for riding in metadata["ridings"]:
        rid = riding["id"]
        rows = observations[observations.target_riding.astype(int) == rid]
        totals = rows.groupby("party").votes.sum()
        votes = int(totals.sum())
        # Synthetic target units retain split-section membership; this is not an official bureau count.
        all_units = allocations[allocations.target_riding.astype(int) == rid][["source_riding","polling_section"]].drop_duplicates()
        done = rows[["source_riding","polling_section"]].drop_duplicates()
        candidates=[dict(numeroCandidat=party_ids[p],nom=p,prenom="Rejeu",numeroPartiPolitique=party_ids[p],abreviationPartiPolitique=p,nbVoteTotal=int(v),tauxVote=float(v/votes*100) if votes else 0,nbVoteAvance=0) for p,v in totals.items()]
        ridings.append(dict(numeroCirconscription=rid,nomCirconscription=riding["name"],iso8601DateMAJ=timestamp,isResultatsFinaux=args.reporting==100,nbBureauComplete=len(done),nbBureauTotal=len(all_units),nbVoteValide=votes,nbVoteRejete=0,nbVoteExerce=votes,nbElecteurInscrit=0,tauxVoteValide=100 if votes else 0,tauxVoteRejete=0,tauxParticipation="n.d.",candidats=candidates))
    leader_counts={p:0 for p in parties}
    for r in ridings:
        ranked=sorted(r["candidats"], key=lambda c:-c["nbVoteTotal"])
        if ranked and ranked[0]["nbVoteTotal"]>0 and (len(ranked)==1 or ranked[0]["nbVoteTotal"]>ranked[1]["nbVoteTotal"]):
            leader_counts[ranked[0]["abreviationPartiPolitique"]]+=1
    votes=int(observations.votes.sum())
    party_totals=observations.groupby("party").votes.sum()
    stats=dict(partisPolitiques=[dict(numeroPartiPolitique=party_ids[p],nomPartiPolitique=p,abreviationPartiPolitique=p,nbVoteTotal=int(party_totals.get(p,0)),tauxVoteTotal=float(party_totals.get(p,0)/votes*100) if votes else 0,nbCirconscriptionsEnAvance=leader_counts[p],tauxCirconscriptionsEnAvance=leader_counts[p]/127*100) for p in parties],nbBureauVote=sum(r["nbBureauTotal"] for r in ridings),nbBureauVoteRempli=sum(r["nbBureauComplete"] for r in ridings),tauxBureauVoteRempli=0,nbVoteValide=votes,nbVoteRejete=0,nbVoteExerce=votes,nbElecteurInscrit=0,tauxParticipationTotal="n.d.",nbCirconscription=127,nbCirconscriptionAvecResultat=sum(r["nbVoteValide"]>0 for r in ridings),nbCirconscriptionSansResultat=sum(r["nbVoteValide"]==0 for r in ridings),tauxCirconscriptionSansResultat=0,isResultatsFinaux=args.reporting==100,iso8601DateMAJ=timestamp)
    stats["tauxBureauVoteRempli"] = stats["nbBureauVoteRempli"] / stats["nbBureauVote"] * 100 if stats["nbBureauVote"] else 0
    stats["tauxCirconscriptionSansResultat"] = stats["nbCirconscriptionSansResultat"] / 127 * 100
    payload=dict(replay=dict(election=args.election,reporting=args.reporting,seed=args.seed,order="hashed-units",sourceHash=source_hash,crosswalkHash=crosswalk_hash),result=dict(statistiques=stats,circonscriptions=ridings))
    diagnostics = dict(election=args.election, sourceUnits=len(ordered), reportedSourceUnits=count, zeroVoteUnitsWithoutAllocation=[dict(sourceRiding=r, pollingSection=p) for r,p in missing])
    (folder / f"{args.election}-diagnostics.json").write_text(json.dumps(diagnostics, ensure_ascii=False)+"\n")
    output=folder/"snapshot.json"
    temporary=output.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload,ensure_ascii=False,allow_nan=False)+"\n")
    temporary.replace(output)
    print(f"{output}: {count}/{len(ordered)} historical units; {votes} votes; {len(missing)} zero-vote units without target allocations (enumerated in diagnostics)",flush=True)

if __name__ == "__main__":
    main()
