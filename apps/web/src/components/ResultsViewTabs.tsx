"use client";

import { Tabs } from "@base-ui/react/tabs";
import { ElectionMap } from "./ElectionMap";

export function ResultsViewTabs() {
  return (
    <Tabs.Root defaultValue="geography" className="resultsTabs">
      <Tabs.List className="tabList" aria-label="Vue des résultats">
        <Tabs.Tab className="tab" value="geography">
          Géographie
        </Tabs.Tab>
        <Tabs.Tab className="tab" value="seats">
          127 sièges
        </Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel className="tabPanel" value="geography">
        <ElectionMap
          svgUrl="/maps/quebec.svg"
          ridings={[]}
          ariaLabel="Carte des résultats par circonscription"
        />
      </Tabs.Panel>

      <Tabs.Panel className="tabPanel" value="seats">
        <ElectionMap
          svgUrl="/maps/cartogram.svg"
          ridings={[]}
          ariaLabel="Cartogramme des 127 sièges"
        />
      </Tabs.Panel>
    </Tabs.Root>
  );
}
