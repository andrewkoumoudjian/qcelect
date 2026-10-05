import { LiveResults } from "../components/LiveResults";

export default function Home() {
  return (
    <main className="page">
      <header className="masthead">
        <div>
          <p className="eyebrow">Québec 2026</p>
          <h1>Résultats en direct</h1>
        </div>
      </header>

      <LiveResults />

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
