// Language-neutral data for the "Selected work" list: names, stacks and links.
// Translated copy (description, facts, chip, note) lives in lang/terminal/{lang}.json
// under `cases.<id>`.
(function (window) {
  'use strict';

  window.TerminalCases = [
    { id: 'saas-tools', name: 'saas-tools', stack: ['FastAPI', 'React', 'PostgreSQL (Neon)', 'Render'], href: 'https://saas-tools-web.onrender.com/' },
    { id: 'play-store-mcp', name: 'play-store-mcp', stack: ['Kotlin', 'MCP', 'Google Play API'], href: 'https://github.com/develop4God/play-store-mcp' },
    { id: 'DevocionalesAPI', name: 'DevocionalesAPI', stack: ['Python', 'Anthropic', 'Gemini', 'Fireworks', 'DashScope', 'Ollama'], href: 'https://github.com/develop4God/DevocionalesAPI' },
    { id: 'devocionales-ai-review', name: 'devocionales-ai-review', stack: ['Python', 'LangGraph'], href: 'https://github.com/develop4God/devocionales-ai-review' },
    { id: 'sanctions-check', name: 'sanctions-check', stack: ['React', 'FastAPI', 'Electron'], href: 'https://github.com/develop4God/sanctions-check' }
  ];
})(window);
