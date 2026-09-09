// Runs real source helpers in Chromium against a clone of the RC1-rendered card.
// This supplements, not replaces, the actual mounted renderer topology checks.
window.checkComposerAdapters = async () => {
  const { mountHistoricalComposer } = await import(
    "/plugins/providers/src/client/historical-composer.ts"
  );
  const { syncComposerHint } = await import(
    "/plugins/xtz-ui/src/client/composer-hint.ts"
  );
  const { installComposerHint } = await import(
    "/plugins/xtz-ui/src/client/composer-hint-controller.ts"
  );
  const check = (value, message) => {
    if (!value) throw new Error(message);
  };
  const settle = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  };
  const doc = document.implementation.createHTMLDocument(
    "owned composer fixture",
  );
  const hero = doc.createElement("section");
  hero.dataset.phase = "hero";
  doc.body.append(hero);
  const original = document.querySelector("[data-composer-card]");
  check(original !== null, "Must sample the rendered RC1 card");
  const card = original.cloneNode(true);
  card
    .querySelectorAll(
      "[data-dsh-providers-smart-ux], [data-dsh-providers-historical-composer]",
    )
    .forEach((node) => node.remove());
  const todo = doc.createElement("p");
  todo.textContent = "Unrelated Todo";
  const queue = doc.createElement("p");
  queue.textContent = "Unrelated Queue";
  hero.append(todo, queue, card);
  const hostBefore = [todo.outerHTML, queue.outerHTML, card.outerHTML];
  let scans = 0;
  const query = doc.querySelectorAll.bind(doc);
  doc.querySelectorAll = (selector) => {
    if (selector === "[data-composer-card]") scans++;
    return query(selector);
  };
  const off = mountHistoricalComposer(doc, "历史模型：fixture");
  await settle();
  check(
    scans === 1,
    "Own initial node insertion must not trigger another scan",
  );
  const owned = doc.querySelector("[data-dsh-providers-historical-composer]");
  check(
    owned?.parentElement === card,
    "Historical node belongs in actual card",
  );
  scans = 0;
  owned.firstChild.textContent = "历史模型：updated own text";
  owned.append(doc.createElement("span"));
  await settle();
  check(scans === 0, "Own child/text mutations must be filtered");
  hero.dataset.phase = "active";
  hero.dataset.phase = "hero";
  hero.dataset.phase = "active";
  await settle();
  check(
    scans === 1 && !owned.isConnected,
    "External mutation burst coalesces, active card suppresses history",
  );
  hero.dataset.phase = "hero";
  await settle();
  check(owned.parentElement === card, "Return to verified hero card");
  const replacement = card.cloneNode(true);
  replacement
    .querySelector("[data-dsh-providers-historical-composer]")
    ?.remove();
  card.replaceWith(replacement);
  await settle();
  check(
    owned.parentElement === replacement,
    "Follow replaced actual card, moving only our own node",
  );
  hero.append(card);
  await settle();
  check(!owned.isConnected, "Two matching cards are ambiguous");
  card.remove();
  await settle();
  check(owned.parentElement === replacement, "Resume after ambiguity clears");
  replacement.removeAttribute("data-composer-card");
  await settle();
  check(!owned.isConnected, "Selector mismatch fails closed");
  replacement.setAttribute("data-composer-card", "true");
  queueMicrotask(off);
  await settle();
  check(
    doc.querySelector("[data-dsh-providers-historical-composer]") === null,
    "Queued work cannot resurrect disposed mount",
  );
  check(
    todo.outerHTML === hostBefore[0] && queue.outerHTML === hostBefore[1],
    "Never change sibling nodes/styles/classes",
  );
  check(
    card.outerHTML === hostBefore[2],
    "Original RC1 card restored without Host mutations",
  );
  for (let i = 0; i < 20; i++) {
    const dispose = mountHistoricalComposer(doc, "历史模型：HMR");
    check(
      doc.querySelectorAll("[data-dsh-providers-historical-composer]")
        .length === 1,
      "Exactly one owned node per mount",
    );
    dispose();
  }
  scans = 0;
  hero.dataset.phase = "active";
  await settle();
  check(scans === 0, "Disposed observers do not scan after 20 cycles");
  // Native placeholder always wins, including retirement of a stale legacy hint.
  const native = replacement.querySelector("[data-composer-placeholder]");
  check(native !== null, "Use actual RC1 native placeholder");
  const stale = doc.createElement("div");
  stale.setAttribute("data-dsh-xtz-ui-composer-hint", "");
  replacement.append(stale);
  syncComposerHint(doc);
  check(!stale.isConnected, "Native placeholder retires stale fallback");
  // Legacy textarea remains supported; no Host style or native placeholder edits.
  const legacy = doc.createElement("div");
  legacy.setAttribute("data-composer-card", "true");
  const grow = legacy.appendChild(doc.createElement("div"));
  const textarea = grow.appendChild(doc.createElement("textarea"));
  textarea.dataset.phase = "plain";
  textarea.placeholder = "Legacy fixture";
  replacement.replaceWith(legacy);
  hero.dataset.phase = "hero";
  const stopHint = installComposerHint(doc);
  check(
    grow.querySelector("[data-dsh-xtz-ui-composer-hint]")?.textContent ===
      "Legacy fixture",
    "Legacy fallback mounts",
  );
  for (const value of ["text", " ", "a\nb", ""]) {
    textarea.value = value;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
    check(
      grow.querySelectorAll("[data-dsh-xtz-ui-composer-hint]").length ===
        (value === "" ? 1 : 0),
      "Typing/clearing/multiline/whitespace legacy hint",
    );
  }
  grow.append(native.cloneNode(true));
  await settle();
  check(
    !grow.querySelector("[data-dsh-xtz-ui-composer-hint]"),
    "Native appearance retires fallback through observer",
  );
  grow.querySelector("[data-composer-placeholder]").remove();
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  stopHint();
  await settle();
  check(
    !grow.querySelector("[data-dsh-xtz-ui-composer-hint]"),
    "Disposed queued hint must not remount",
  );
};
