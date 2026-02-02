# LingoTracker Monorepo Architecture

## Overall Monorepo Structure

```mermaid
graph TB
    subgraph Applications["📱 Applications"]
        CLI["apps/cli<br/>CLI Interface<br/>(Commander, Node.js)"]
        API["apps/api<br/>REST API<br/>(NestJS, Express)"]
        TRACKER["apps/tracker<br/>Web UI<br/>(Angular 20, Material)"]
    end

    subgraph Libraries["📚 Libraries"]
        CORE["libs/core<br/>Core Business Logic"]
        DATATRANSFER["libs/data-transfer<br/>DTOs & Contracts"]
    end

    subgraph CoreModules["🔧 Core Modules"]
        CONFIG["config/<br/>Configuration"]
        RESOURCE["resource/<br/>CRUD & Metadata"]
        FILEIO["file-io/<br/>File Operations"]
        FOLDER["folder/<br/>Folder Management"]
        BUNDLE["bundle/<br/>Bundles & Types"]
        VALIDATE["validate/<br/>Validation"]
        EXPORT["export/<br/>Export (XLIFF, JSON)"]
        IMPORT["import/<br/>Import (XLIFF, JSON)"]
        NORMALIZE["normalize/<br/>Normalization"]
        ERRORS["errors/<br/>Error Handling"]
    end

    subgraph SharedDTOs["📦 Shared Data Contracts"]
        DTO_COLLECTION["Collection DTOs<br/>CreateCollection, UpdateCollection"]
        DTO_RESOURCE["Resource DTOs<br/>CreateResource, UpdateResource, DeleteResource"]
        DTO_FOLDER["Folder DTOs<br/>CreateFolder, MoveResource"]
        DTO_SEARCH["Search DTOs<br/>SearchResult, SearchTranslations"]
        DTO_TREE["Tree DTOs<br/>ResourceTree, TreeStatusResponse"]
        DTO_CONFIG["Config DTOs<br/>Collection, Global Config"]
    end

    %% Application Dependencies
    CLI -->|imports| CORE
    CLI -->|uses| DATATRANSFER
    API -->|imports| CORE
    API -->|imports| DATATRANSFER
    TRACKER -->|imports| DATATRANSFER

    %% Core Module Structure
    CORE --> CONFIG
    CORE --> RESOURCE
    CORE --> FILEIO
    CORE --> FOLDER
    CORE --> BUNDLE
    CORE --> VALIDATE
    CORE --> EXPORT
    CORE --> IMPORT
    CORE --> NORMALIZE
    CORE --> ERRORS

    %% Internal Core Dependencies
    RESOURCE -->|uses| CONFIG
    RESOURCE -->|uses| FILEIO
    RESOURCE -->|uses| ERRORS
    BUNDLE -->|uses| RESOURCE
    VALIDATE -->|uses| RESOURCE
    EXPORT -->|uses| RESOURCE
    IMPORT -->|uses| RESOURCE
    NORMALIZE -->|uses| RESOURCE

    %% DTO Dependencies
    DATATRANSFER --> DTO_COLLECTION
    DATATRANSFER --> DTO_RESOURCE
    DATATRANSFER --> DTO_FOLDER
    DATATRANSFER --> DTO_SEARCH
    DATATRANSFER --> DTO_TREE
    DATATRANSFER --> DTO_CONFIG

    style Applications fill:#e1f5ff
    style Libraries fill:#f3e5f5
    style CoreModules fill:#fff3e0
    style SharedDTOs fill:#e8f5e9
