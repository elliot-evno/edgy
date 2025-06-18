# Edgy

## Technical Implementation

**Screen AI Chat** is a desktop application built with **Electron** for cross-platform compatibility, integrating AI capabilities to interact with screen content.

### Architecture
- **Renderer Process**: Handles UI with React components (`src/renderer/`), including custom hooks and components for chat interactions.
- **Main Process**: Manages native integrations (`src/native/`), including window, screen, and memory management via TypeScript modules.
- **Server Layer**: Provides API endpoints (`src/server/api.ts`) for AI model interactions.
- **IPC**: Custom IPC manager for secure communication between renderer and main processes.

### Development Setup
```bash
# Clone the repo
npm install
npm run dev
```

### Build
```bash
npm run build
```

For more details, refer to the project structure in `src/`. 