# Tasks: 50/50-Gleisaufteilung

- [x] 1. Datenmodell
  - [x] 1.1 `BlockStopMode`, `BlockStopPolicy` und neue Block-Felder in `server/src/types.ts` und `client/src/types.ts` (Req 1, 2)
- [x] 2. SplitBlockEngine (`server/src/engine/SplitBlockEngine.ts`)
  - [x] 2.1 `resolveConfig` mit Validierung und Begrenzung (Req 1.5, 7.5)
  - [x] 2.2 `planStop` als reine Funktion (Req 3.2, 4.2)
  - [x] 2.3 Integrator, `onFirstSensor`, `onSecondSensor`, Planausführung mit Token, virtueller IN (Req 2, 3, 4, 5)
  - [x] 2.4 `cancel`, `cancelAll`, Prellschutz (Req 7)
- [x] 3. BBTEngine: `handleInEvent` mit Option `stop: false`; keine Rampe bei stehender Lok
- [x] 4. BlockManager
  - [x] 4.1 IN-Zweig in `applyIn` extrahiert, `triggerVirtualIn` (Req 7.4)
  - [x] 4.2 SPLIT-Zweig für zweiten Melder (Req 6)
- [x] 5. Integration in `server/src/index.ts` (Enter, zweiter Melder, Speed, Not-Halt, Lok löschen, Block freigeben)
- [x] 6. Client: Checkbox und Einstellungen im Block-Modal, Speichern/Laden, i18n DE/EN (Req 1.3, 1.4)
- [x] 7. Tests `scripts/test_split_block.mjs` (20 Tests) + `npm run test:split`, Teil von `npm test`
- [x] 8. Build, Tests, Security-Tests, End-to-End gegen isolierten Server im Simulator, Ticket/Changelog
