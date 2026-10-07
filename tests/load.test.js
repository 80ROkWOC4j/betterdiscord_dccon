const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(file, {components = false, missingSearchModule = true, environment = {}, api = {}} = {}) {
  const context = {
    structuredClone,
    module: {exports: {}},
    window: {addEventListener() {}, removeEventListener() {}},
    document: {addEventListener() {}, removeEventListener() {}},
    ...environment,
    BdApi: {
      Plugins: {get: () => ({name: 'DCCon'})},
      Data: {load: () => undefined},
      React: {
        Component: class {
          constructor(props) { this.props = props; }
          setState(state) { Object.assign(this.state, state); }
        },
        createElement: (type, props, ...children) => {
          if (typeof props?.ref === 'string') throw new Error('Invalid string ref (#284)');
          return {type, props: {...props, children}};
        },
      },
      Webpack: {
        getByKeys: (...keys) => {
          if (keys.join(',') === 'dispatch,subscribe') return undefined;
          if (missingSearchModule && keys.join(',') === 'container,inner,pointer') return undefined;
          return Object.fromEntries(keys.map(key => [key, key]));
        },
        getModule: () => ({}),
        Filters: {byKeys: () => () => true},
      },
      ...api,
    },
  };
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  vm.runInNewContext(source + (components ? '\nmodule.exports = {DCConButton, DCConPanel, events: typeof PluginEvents === "undefined" ? undefined : PluginEvents};' : ''), context);
  return context.module.exports;
}

test('button and picker render with valid refs; clearing search resets the input', () => {
  const {DCConButton, DCConPanel} = load('DCCon.plugin.js', {components: true});
  assert.doesNotThrow(() => new DCConButton({}).render());
  const panel = new DCConPanel({type: 'dccon'});
  function findInput(node) {
    if (node?.type === 'input') return node;
    for (const child of node?.props?.children?.flat(Infinity) ?? []) {
      const input = findInput(child);
      if (input) return input;
    }
  }
  let input = findInput(panel.render());
  input.props.onChange({target: {value: '만두'}});
  assert.equal(findInput(panel.render()).props.value, '만두');
  panel.clearSearch();
  assert.equal(findInput(panel.render()).props.value, '');
});

test('patched plugin loads without the removed search CSS module', () => {
  const Plugin = load('DCCon.plugin.js');
  assert.equal(typeof Plugin, 'function');
  const css = Object.getOwnPropertyDescriptor(Plugin.prototype, 'css').get.call({});
  assert.match(css, /\.dccon-search-input/);
  assert.match(css, /\.dccon-rail/);
});

test('pack navigation and search filter individual images without changing saved packs', () => {
  const packs = [
    {info: {package_idx: 1, title: '고양이'}, detail: [{idx: 1, title: '안녕'}, {idx: 2, title: '잘자'}]},
    {info: {package_idx: 2, title: '강아지'}, detail: [{idx: 3, title: '안녕'}]},
  ];
  const {DCConPanel} = load('DCCon.plugin.js', {components: true, api: {Data: {load: () => packs}}});
  const panel = new DCConPanel({type: 'dccon'});
  panel.state.textFilter = '안녕';
  assert.equal(panel.filterDccons().length, 2);
  assert.equal(panel.filterDccons()[0].detail.length, 1);
  panel.state.selected = '1';
  assert.equal(panel.filterDccons().length, 1);
  panel.state.textFilter = '고양이';
  assert.equal(panel.filterDccons()[0].detail.length, 2);
  panel.state.textFilter = '없는 콘';
  assert.equal(panel.filterDccons().length, 0);
  assert.equal(packs[0].detail.length, 2);
});

test('private events update mounted components and detach on unmount', () => {
  const {DCConButton, events} = load('DCCon.plugin.js', {components: true});
  const button = new DCConButton({channelId: 'test-channel'});
  const recent = {componentDidMount() { events.subscribe("DCCON_RECENT_UPDATE", update); }, componentWillUnmount() { events.unsubscribe("DCCON_RECENT_UPDATE", update); }};
  const update = () => recent.setState();
  button.componentDidMount();
  recent.componentDidMount();
  button.state.active = true;
  events.dispatch({type: 'DCCON_CLOSE'});
  assert.equal(button.state.active, false);
  let updates = 0;
  recent.setState = () => { updates++; };
  events.dispatch({type: 'DCCON_RECENT_UPDATE'});
  assert.equal(updates, 1);
  button.componentWillUnmount();
  recent.componentWillUnmount();
  button.state.active = true;
  events.dispatch({type: 'DCCON_CLOSE'});
  events.dispatch({type: 'DCCON_RECENT_UPDATE'});
  assert.equal(button.state.active, true);
  assert.equal(updates, 1);
});

test('stop notifications reach every listener even when listeners unsubscribe', () => {
  const {events} = load('DCCon.plugin.js', {components: true});
  const calls = [];
  const first = () => {
    calls.push('first');
    events.unsubscribe('DCCON_UNPATCH_ALL', first);
  };
  const second = () => { calls.push('second'); };
  events.subscribe('DCCON_UNPATCH_ALL', first);
  events.subscribe('DCCON_UNPATCH_ALL', second);
  events.dispatch({type: 'DCCON_UNPATCH_ALL'});
  assert.deepEqual(calls, ['first', 'second']);
});

test('real React: click opens picker without Discord picker modules; close, manage and channel switching work', async () => {
  const {JSDOM, VirtualConsole} = require('jsdom');
  const React = require('react');
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {virtualConsole});
  const previousWindow = global.window;
  const previousDocument = global.document;
  const previousAct = global.IS_REACT_ACT_ENVIRONMENT;
  global.window = dom.window;
  global.document = dom.window.document;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const ReactDOM = require('react-dom');
  const {createRoot} = require('react-dom/client');
  const {DCConButton, events} = load('DCCon.plugin.js', {
    components: true,
    environment: {window: dom.window, document: dom.window.document},
    api: {React, ReactDOM},
  });
  const root = createRoot(document.getElementById('root'));
  const click = async (element) => {
    assert.ok(element, 'click target must exist');
    await React.act(async () => element.dispatchEvent(new window.MouseEvent('click', {bubbles: true})));
  };
  try {
    await React.act(async () => root.render(React.createElement(DCConButton, {channelId: 'one'})));
    const trigger = document.querySelector('.dccon-trigger');
    await click(trigger);
    assert.ok(document.querySelector('[role="dialog"]'));
    assert.ok(document.querySelector('.dccon-search-input'));
    assert.equal(trigger.getAttribute('aria-expanded'), 'true');
    await click(document.querySelectorAll('.dccon-popover-toolbar button')[2]);
    assert.ok(document.querySelector('.dccon-options'));
    assert.match(document.querySelector('.dccon-diagnostics').textContent, /버그 제보/);
    assert.equal(document.querySelector('.dccon-tab-menu'), null);
    await click(document.querySelectorAll('.dccon-popover-toolbar button')[1]);
    assert.ok(document.querySelector('.dccon-settings-panel'));
    await click(document.querySelectorAll('.dccon-popover-toolbar button')[0]);
    assert.ok(document.querySelector('.dccon-search-input'));
    await React.act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown', {key: 'Escape', bubbles: true})));
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(document.activeElement, trigger);
    await click(trigger);
    await React.act(async () => document.querySelector('.dccon-overlay').dispatchEvent(new window.MouseEvent('mousedown', {bubbles: true})));
    assert.equal(document.querySelector('[role="dialog"]'), null);
    await click(trigger);
    await React.act(async () => root.render(React.createElement(DCConButton, {channelId: 'two'})));
    assert.equal(document.querySelector('[role="dialog"]'), null);
    await click(trigger);
    await React.act(async () => events.dispatch({type: 'DCCON_UNPATCH_ALL'}));
    assert.equal(document.querySelector('[role="dialog"]'), null);
    await click(trigger);
    await React.act(async () => root.unmount());
    assert.equal(document.querySelector('.dccon-overlay'), null);
    assert.deepEqual(errors, []);
  } finally {
    await React.act(async () => root.unmount());
    dom.window.close();
    global.window = previousWindow;
    global.document = previousDocument;
    global.IS_REACT_ACT_ENVIRONMENT = previousAct;
  }
});
