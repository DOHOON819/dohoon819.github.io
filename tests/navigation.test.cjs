const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require("node:path").join(__dirname, "../navigation.js"), "utf8");
function navigation() {
  const ids = ["soilCard", "waterStatus", "device", "history", "care"];
  const events = {};
  const tops = [500, 500, 900, 1250, 1250];
  const links = ids.map(id => ({
    hash: "#" + id, attributes: {}, handlers: {},
    classList: { toggle() {} },
    setAttribute(k, v) { this.attributes[k] = v; },
    removeAttribute(k) { delete this.attributes[k]; },
    addEventListener(k, fn) { this.handlers[k] = fn; },
  }));
  const win = {
    innerHeight: 800, scrollY: 0, location: { hash: "" },
    requestAnimationFrame(fn) { fn(); },
    addEventListener(k, fn) { events[k] = fn; },
  };
  const doc = {
    querySelectorAll: () => links,
    getElementById: id => ({ getBoundingClientRect: () => ({ top: tops[ids.indexOf(id)] - win.scrollY }) }),
    documentElement: { scrollHeight: 2000 },
  };
  vm.runInNewContext(source, { document: doc, window: win });
  return {
    current: () => links.find(l => l.attributes["aria-current"] === "location").hash,
    click(i) { links[i].handlers.click(); },
    scroll(y) { win.scrollY = y; events.scroll(); },
    hash(value) { win.location.hash = value; events.hashchange(); },
  };
}
test("scrolling follows the displayed panel sequence", () => {
  const nav = navigation();
  assert.equal(nav.current(), "#soilCard");
  nav.scroll(750);
  assert.equal(nav.current(), "#device");
  nav.scroll(1100);
  assert.equal(nav.current(), "#history");
});
test("clicking a side-by-side panel keeps that menu selected", () => {
  const nav = navigation();
  nav.click(1); nav.scroll(500);
  assert.equal(nav.current(), "#waterStatus");
  nav.scroll(750);
  assert.equal(nav.current(), "#device");
});
test("hash navigation selects the guide and retains it at the page end", () => {
  const nav = navigation();
  nav.hash("#care"); nav.scroll(1200);
  assert.equal(nav.current(), "#care");
});
