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
- [x] Add ability to add collection from tracker app
  - [x] Move business logic for adding collection to core library
  - [x] Update CLI to call addCollection from core library
  - [x] Add end point to create collection.  Create DTOs in data-transfer library and add mappers as needed.
  - [x] Add create collection button in the collections view in tracker, this should open up a dialog to collect all required information to create new collection.  The dialog should have 2 buttons: Create and Cancel.  If the user clicks Create button call API to create the collection then show toast when successful and redirect to collections view.
- [ ] Add ability to edit collection from tracker app