// Mount the existing React picker next to the native composer controls.
// Unlike the BD adapter, this does not depend on a particular component's source.
function mountToolbar(shelter, Button) {
  const roots = new Map();
  const store = shelter.flux.storesFlat.SelectedChannelStore;
  let pending = false, stopped = false;
  function channelFor(editor) {
    for (let fiber = shelter.util.getFiber(editor); fiber; fiber = fiber.return) {
      const channel = fiber.memoizedProps?.channel;
      if (channel?.id) return channel.id;
    }
    return store?.getChannelId?.();
  }
  function update() {
    pending = false;
    if (stopped) return;
    const active = new Set();
    for (const editor of document.querySelectorAll('[role="textbox"][contenteditable="true"]')) {
      const composer = editor.closest('[class*="channelTextArea"]');
      const toolbar = composer?.querySelector('[class*="buttons_"]');
      const channelId = channelFor(editor);
      if (!toolbar || !channelId) continue;
      active.add(toolbar);
      let entry = roots.get(toolbar);
      if (entry && !toolbar.contains(entry.host)) {
        entry.root.unmount(); roots.delete(toolbar); entry = null;
      }
      if (!entry) {
        const host = document.createElement('div');
        host.className = 'dccon-shelter-host';
        host.style.cssText = 'display:flex;align-items:center;flex:0 0 auto';
        toolbar.append(host);
        entry = {host, root: shelter.ReactDOMClient.createRoot(host)};
        roots.set(toolbar, entry);
      }
      if (entry.channelId !== channelId) {
        entry.channelId = channelId;
        entry.root.render(shelter.React.createElement(Button, {channelId}));
      }
    }
    for (const [toolbar, entry] of roots) if (!active.has(toolbar)) {
      entry.root.unmount(); entry.host.remove(); roots.delete(toolbar);
    }
  }
  function schedule() {
    if (pending || stopped) return;
    pending = true;
    queueMicrotask(update);
  }
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, {childList: true, subtree: true});
  store?.addChangeListener(schedule);
  update();
  return () => {
    stopped = true; observer.disconnect(); store?.removeChangeListener(schedule);
    for (const entry of roots.values()) {entry.root.unmount(); entry.host.remove();}
    roots.clear();
  };
}
if (typeof module !== 'undefined') module.exports = {mountToolbar};
