/**
 * Keyboard Controller (Separation of Concerns)
 * Manages keybindings, modal shortcuts (?), and viewport navigation triggers.
 */

export class KeyboardController {
  private static instance: KeyboardController | null = null;
  private initialized = false;

  private constructor() {}

  public static getInstance(): KeyboardController {
    if (!KeyboardController.instance) {
      KeyboardController.instance = new KeyboardController();
    }
    return KeyboardController.instance;
  }

  public init() {
    if (this.initialized) return;
    this.initialized = true;

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isTyping = activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.tagName === 'SELECT' ||
        (activeEl as HTMLElement).isContentEditable
      );

      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        if (!isTyping) {
          e.preventDefault();
          if (typeof (window as any).toggleShortcutsModal === "function") {
            (window as any).toggleShortcutsModal();
          }
        }
        return;
      }

      if (isTyping) return;

      const switchTab = (window as any).switchSidebarTab;
      if (typeof switchTab === 'function') {
        switch (e.key) {
          case '1': switchTab('left-tab-bar', 'files'); break;
          case '2': switchTab('left-tab-bar', 'finder'); break;
          case '3': switchTab('left-tab-bar', 'schedule'); break;
          case '4': switchTab('right-tab-bar', 'scene'); break;
          case '5': switchTab('right-tab-bar', 'inspector'); break;
          case '6': switchTab('right-tab-bar', 'controls'); break;
          case '7': switchTab('right-tab-bar', 'tools'); break;
        }
      }

      // WASD / Arrow movement for 3D Camera Controls
      const world = (window as any).viewer_world;
      if (world && world.camera && world.camera.controls) {
        const controls = world.camera.controls;
        const key = e.key.toLowerCase();
        const moveSpeed = 2;
        if (key === 'w' || key === 'arrowup') {
          controls.forward(moveSpeed, true);
        } else if (key === 's' || key === 'arrowdown') {
          controls.forward(-moveSpeed, true);
        } else if (key === 'a' || key === 'arrowleft') {
          controls.truck(-moveSpeed, 0, true);
        } else if (key === 'd' || key === 'arrowright') {
          controls.truck(moveSpeed, 0, true);
        } else if (key === 'q') {
          controls.truck(0, moveSpeed, true);
        } else if (key === 'e') {
          controls.truck(0, -moveSpeed, true);
        }
      }
    });
  }
}
