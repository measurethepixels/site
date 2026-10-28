/* No engine mapping or API token is part of this static bundle. */
(() => {
  "use strict";
  const root = document.querySelector("[data-reader-test]");
  if (!root) return;
  const key = "mtp-reader-ranks-v1",
    revision = root.dataset.revision;
  let state = null,
    busy = false;
  try {
    state = JSON.parse(localStorage.getItem(key));
  } catch {}
  if (state?.revision !== revision) state = null;
  const status = root.querySelector("[role=status]"),
    stage = root.querySelector("[data-stage]");
  const save = () => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      status.textContent =
        "Your browser cannot save progress. Keep this tab open until you finish.";
    }
  };
  function el(tag, text, attrs = {}) {
    const n = document.createElement(tag);
    if (text !== null) n.textContent = text;
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  }
  async function api(path, data) {
    const headers = {};
    if (state?.token) headers.Authorization = `Bearer ${state.token}`;
    const options = {
      method: data === undefined ? "GET" : "POST",
      headers,
      credentials: "omit",
      cache: "no-store",
      mode: "same-origin",
    };
    if (data !== undefined) {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(data);
    }
    const r = await fetch(`/api/blind/${path}`, options);
    let result;
    try {
      result = await r.json();
    } catch {
      throw Error(
        "The ranking service is unavailable. Your choices are saved; try again later.",
      );
    }
    if (!r.ok) {
      if (r.status === 401)
        throw Error(
          "This session has expired. Your submitted votes are kept. Start a new test if you want to try again.",
        );
      if (r.status === 429)
        throw Error(
          "Too many requests. Wait a minute, then retry. Your choices are saved.",
        );
      throw Error(
        `The service could not accept this request (${result.error || r.status}). Your saved request can be retried.`,
      );
    }
    return result;
  }
  async function action(fn) {
    if (busy) return;
    busy = true;
    root.setAttribute("aria-busy", "true");
    for (const b of root.querySelectorAll("button")) b.disabled = true;
    status.textContent = "Saving…";
    try {
      await fn();
      status.textContent = "";
    } catch (e) {
      status.textContent = e.message;
    } finally {
      busy = false;
      root.removeAttribute("aria-busy");
      for (const b of root.querySelectorAll("button")) b.disabled = false;
    }
  }
  function button(text, fn) {
    const b = el("button", text, { type: "button" });
    b.addEventListener("click", () => action(fn));
    return b;
  }
  function startView() {
    stage.replaceChildren(
      el(
        "p",
        "Rank the pictures by your preference: 1 is best, 4 is last. Ties and gaps are allowed, but at least one picture must rank 1. No scores or engines are revealed during the test.",
      ),
    );
    stage.append(
      button("Start the blind test", async () => {
        state = await api("session", { revision });
        state.accepted = {};
        state.pending = {};
        state.target = 0;
        save();
        render();
      }),
    );
    if (state)
      stage.append(
        button("Resume saved test", async () => {
          renderTarget();
        }),
      );
  }
  async function finish(mode) {
    state.finishMode = state.finishMode || mode;
    save();
    await api("finish", { mode: state.finishMode });
    state.closed = true;
    save();
    location.href =
      "/handbook/experiments/stacking-engines.html#reader-results";
  }
  function renderTarget() {
    if (!state) return startView();
    if (state.closed || state.finishMode) {
      stage.replaceChildren(
        el(
          "p",
          "Your test is ready to finish. Retry to confirm the saved request and return to the results.",
        ),
      );
      stage.append(
        button("Confirm and see results", () =>
          finish(state.finishMode || "finish"),
        ),
      );
      return;
    }
    const targets = [...new Set(state.crops.map((c) => c.target))];
    if (state.target >= targets.length) {
      stage.replaceChildren(
        el("h2", "Your rankings are saved"),
        el("p", "Finish the test to reveal the engines and reader results."),
      );
      stage.append(button("Finish and see results", () => finish("finish")));
      return;
    }
    const target = targets[state.target],
      crops = state.crops.filter((c) => c.target === target);
    stage.replaceChildren(
      el("p", `Target ${state.target + 1} of ${targets.length}`, {
        class: "reader-progress",
      }),
      el("h2", target),
    );
    for (const crop of crops) {
      const field = el("fieldset", null, { "data-crop": crop.id });
      field.append(
        el(
          "legend",
          crop.region === "faint"
            ? "Faint signal"
            : crop.region === "stars"
              ? "Star field"
              : "Core",
        ),
      );
      const grid = el("div", null, { class: "reader-tiles" });
      crop.tiles.forEach((tile, i) => {
        const letter = "ABCD"[i],
          label = el("label", null, { class: "reader-tile" }),
          a = el("a", null, {
            href: tile.url,
            target: "_blank",
            rel: "noopener",
          });
        a.append(
          el("img", null, {
            src: tile.url,
            alt: `${target}, ${crop.region}, version ${letter}`,
            width: "600",
            height: "600",
            loading: "lazy",
          }),
        );
        label.append(a, el("span", `Version ${letter} · rank`));
        const select = el("select", null, {
          "aria-label": `${crop.region}, version ${letter} rank`,
          "data-tile": tile.id,
        });
        select.append(el("option", "Choose…", { value: "" }));
        for (let rank = 1; rank <= 4; rank++)
          select.append(el("option", String(rank), { value: String(rank) }));
        const saved = state.accepted[crop.id] || state.pending[crop.id];
        if (saved) {
          if (saved.ranks) select.value = saved.ranks[tile.id];
          select.disabled = true;
        }
        label.append(select);
        grid.append(label);
      });
      field.append(grid);
      if (state.accepted[crop.id])
        field.append(
          el("p", state.accepted[crop.id].ranks ? "Submitted" : "Skipped"),
        );
      stage.append(field);
    }
    async function submit(skip) {
      const payloads = [];
      for (const crop of crops) {
        if (state.accepted[crop.id]) continue;
        let payload = state.pending[crop.id];
        if (!payload) {
          const ranks = skip
            ? null
            : Object.fromEntries(
                [
                  ...stage.querySelectorAll(`[data-crop="${crop.id}"] select`),
                ].map((s) => [s.dataset.tile, Number(s.value)]),
              );
          if (
            ranks &&
            (Object.values(ranks).some(
              (r) => !Number.isInteger(r) || r < 1 || r > 4,
            ) ||
              Math.min(...Object.values(ranks)) !== 1)
          )
            throw Error(
              "Choose a rank for every version in all three crops, including at least one rank 1 per crop. Ties are welcome.",
            );
          payload = { revision, crop: crop.id, ranks };
        }
        payloads.push(payload);
      }
      // Freeze the exact request before sending; a lost response can only be retried.
      for (const payload of payloads) state.pending[payload.crop] = payload;
      save();
      renderTarget();
      for (const payload of payloads) {
        await api("vote", payload);
        state.accepted[payload.crop] = payload;
        delete state.pending[payload.crop];
        save();
      }
      state.target++;
      save();
      renderTarget();
    }
    const controls = el("div", null, { class: "reader-actions" });
    controls.append(
      button("Save target and continue", () => submit(false)),
      button("Skip this target", () => submit(true)),
    );
    stage.append(controls);
    stage.append(
      el(
        "p",
        "You may end here. Votes already submitted will be kept; revealing results closes this session to further votes.",
      ),
      button("Skip remaining and see results", () => finish("skip_rest")),
      button("End test and reveal results", () => finish("expose")),
    );
  }
  async function renderResults() {
    stage.replaceChildren();
    if (!state) {
      stage.append(
        el("p", "Take the blind test before reading the results."),
        el("a", "Go to the blind test", {
          href: "/handbook/experiments/stacking-engines-blind.html",
        }),
      );
      return;
    }
    if (!state.closed) {
      stage.append(
        el(
          "p",
          "Your blind test is still open. Finish it first, or end it now to reveal results; you cannot vote afterward.",
        ),
        el("a", "Continue the blind test", {
          href: "/handbook/experiments/stacking-engines-blind.html",
        }),
        button("End test and reveal results", () => finish("expose")),
      );
      return;
    }
    const result = await api("results");
    stage.append(
      el(
        "p",
        `Updated ${result.generated_at}. Freshness target: about 60 seconds; your saved receipt confirms acceptance before aggregates refresh.`,
      ),
    );
    if (!result.rows.length) {
      stage.append(
        el("p", "No reader rankings yet. Skipped crops do not count as votes."),
      );
      return;
    }
    const groups = new Map();
    for (const row of result.rows) {
      const group = `${row.target} · ${row.region}`;
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(row);
    }
    for (const [name, rows] of groups) {
      const wrap = el("div", null, {
          class: "reader-table",
          tabindex: "0",
          role: "region",
          "aria-label": name,
        }),
        table = el("table", null);
      table.append(el("caption", name));
      const head = el("tr", null);
      for (const title of [
        "Engine",
        "Mean rank",
        "Ranked first",
        "Reader ballots",
        "Jeff’s rank",
      ])
        head.append(el("th", title, { scope: "col" }));
      const thead = el("thead", null);
      thead.append(head);
      table.append(thead);
      const tbody = el("tbody", null);
      for (const r of rows) {
        const tr = el("tr", null);
        tr.append(el("th", r.engine, { scope: "row" }));
        for (const value of [
          r.ballots < 5 ? "Not shown (n < 5)" : Number(r.mean_rank).toFixed(2),
          r.ballots < 5 ? "Not shown (n < 5)" : `${(r.best_share * 100).toFixed(1)}%`,
          String(r.ballots),
          String(r.jeff_rank),
        ])
          tr.append(el("td", value));
        tbody.append(tr);
      }
      table.append(tbody);
      wrap.append(table);
      stage.append(wrap);
      if (rows[0].jeff_note) stage.append(el("p", rows[0].jeff_note));
    }
  }
  function render() {
    if (root.dataset.readerTest === "results") return action(renderResults);
    renderTarget();
  }
  root.querySelector("[data-reset]")?.addEventListener("click", () => {
    state = null;
    try {
      localStorage.removeItem(key);
    } catch {}
    startView();
    status.textContent =
      "Local progress removed. Previously submitted votes are not deleted.";
  });
  if (root.dataset.readerTest === "results") render();
  else if (state) renderTarget();
  else startView();
})();
