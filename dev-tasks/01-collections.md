# Feature: Support translation collections

In a monorepo context it maybe desirable to have multiple translation collections (translation sources) that lingo tracker should handle.

## TODO
- [x] Update application configuration to handle multiple collections
  - [x] Create a new interface LingoTrackerCollection from LingoTrackerConfig
  - [x] Add collections property to LingoTrackerConfig
  - [x] Update init cli command to ask for collection name
- [x] Add ability to add new collection via CLI
- [x] The app should load the configuration, then present a card list of collections to the user to pick (if there is only one collection then proceed).  The next view should show collection name.
- [x] The user should be be able to switch (or navigate to collections card list view) collections.
- [x] Add cli command to delete collection by name
- [x] Add API end point to delete collection by name
- [x] Add delete icon button on collection-card mat card to delete the collection
  - [x] Clicking the button will prompt the user for confirmation then call API end point to delete collection
