import ridingMetadata from "../../../../data/ridings-2026.json";
import { LiveResults } from "../components/LiveResults";

export default function Home() {
  return (
    <main className="page">
      <header className="masthead">
        <div>
          <h1>Québec 2026</h1>
        </div>
      </header>

      <LiveResults ridingMetadata={ridingMetadata.ridings} />

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
