import { ResultsViewTabs } from "../components/ResultsViewTabs";

export default function Home() {
  return (
    <main className="page">
      <header className="masthead">
        <div>
          <p className="eyebrow">Élections générales du Québec · 2026</p>
          <h1>Résultats en direct</h1>
        </div>
        <div className="liveBadge" aria-label="Live results status">
          LIVE
        </div>
      </header>

      <section className="summary" aria-label="Election summary">
        <p className="placeholder">
          Official totals will render here from the normalized qcelect live state.
        </p>
      </section>

      <ResultsViewTabs />

      <section className="resultsTable" aria-label="Riding results">
        <h2>Circonscriptions</h2>
        <p className="placeholder">
          Result rows stay separate from the map so the full election remains
          scannable and accessible.
        </p>
      </section>

      <footer className="sourceNotice">
        Comprend des données ouvertes octroyées sous la licence d'utilisation des
        données ouvertes du directeur général des élections disponible à l'adresse
        Web dgeq.org. L'octroi de la licence n'implique aucune approbation par le
        directeur général des élections de l'utilisation des données ouvertes qui
        en est faite.
      </footer>
    </main>
  );
}
