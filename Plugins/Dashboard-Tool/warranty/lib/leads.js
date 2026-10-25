(() => {
  const TYPES = ["financing", "abandoned", "helpdesk", "other"];
  const STATUSES = ["new", "attempted", "contacted", "callback", "sold", "declined"];
  const STEPS = ["called", "lvm", "texted", "emailed"];
  const CACHE = "plLeadCloud";
  const PENDING = "plLeadPending";

  function sharedLead(input, auth) {
    if (!/^WL-\d+$/.test(input.id || "")) throw new Error("A valid Dash lead ID is required.");
    if (!TYPES.includes(input.type)) throw new Error("Only non-warranty leads belong in the Lead log.");
    if (!STATUSES.includes(input.status)) throw new Error("Invalid Lead log status.");
    if (input.status === "new" && !STEPS.some((step) => Number(input.steps?.[step]) > 0)) {
      throw new Error("Viewing a lead does not log or claim it. Record outreach activity first.");
    }
    const timestamp = (value) => Number.isSafeInteger(value) && value >= 0 ? value : 0;
    return {
      id: input.id,
      type: input.type,
      status: input.status,
      by: auth.name || auth.email.split("@")[0],
      uid: auth.uid,
      ts: timestamp(input.ts) || Date.now(),
      updatedAt: Date.now(),
      ...Object.fromEntries(STEPS.map((step) => [step, timestamp(input.steps?.[step])])),
    };
  }

  self.createDashboardLeadStore = ({ api, getAuth, documents }) => {
    let queue = Promise.resolve();
    const serialize = (fn) => {
      const result = queue.then(fn);
      queue = result.catch(() => {});
      return result;
    };
    const collection = () => `${documents().replace(/\/[^/]+$/, "")}/dashboardLeads`;
    const key = (uid, id) => `${uid}:${id}`;
    const encode = (record) => ({
      fields: Object.fromEntries(Object.entries(record).filter(([field]) => field !== "id")
        .map(([field, value]) => [field, typeof value === "number"
          ? { integerValue: String(value) } : { stringValue: value }])),
    });
    const decode = (doc) => {
      const f = doc.fields || {};
      const s = (field) => f[field]?.stringValue || "";
      const n = (field) => Number(f[field]?.integerValue || 0);
      const id = doc.name.split("/").pop();
      if (!/^WL-\d+$/.test(id) || !TYPES.includes(s("type")) || !STATUSES.includes(s("status"))) {
        throw new Error("The Firestore Lead log contains an unsupported record.");
      }
      return {
        id, type: s("type"), status: s("status"), by: s("by"), uid: s("uid"),
        ts: n("ts"), updatedAt: n("updatedAt"), updateTime: doc.updateTime || "",
        steps: Object.fromEntries(STEPS.filter((step) => n(step)).map((step) => [step, n(step)])),
      };
    };
    async function auth() {
      const value = await getAuth();
      if (!value) throw new Error("Sign in to sync the Lead log. Local changes are kept for retry.");
      return value;
    }
    async function flush(a) {
      const stored = await chrome.storage.local.get([PENDING, CACHE]);
      const pending = stored[PENDING] || {};
      const items = stored[CACHE]?.items || {};
      for (const [pendingId, change] of Object.entries(pending)) {
        if (change.uid !== a.uid) continue;
        if (!change.remove && change.record.status === "new" &&
          !STEPS.some((step) => Number(change.record[step]) > 0)) {
          delete pending[pendingId];
          await chrome.storage.local.set({ [PENDING]: pending });
          continue;
        }
        const url = `${collection()}/${encodeURIComponent(change.id)}`;
        if (change.remove) {
          try {
            await api(url, { method: "DELETE" });
          } catch (error) {
            if (error.code !== "NOT_FOUND") throw error;
          }
          delete items[change.id];
        } else {
          // Replace the document with the strict allowlist; never merge caller-provided fields.
          const query = new URLSearchParams(change.expect
            ? { "currentDocument.updateTime": change.expect }
            : { "currentDocument.exists": "false" });
          const doc = await api(`${url}?${query}`, { method: "PATCH", body: JSON.stringify(encode(change.record)) });
          items[change.id] = decode(doc);
        }
        delete pending[pendingId];
        await chrome.storage.local.set({ [PENDING]: pending, [CACHE]: { items } });
      }
    }
    async function enqueue(input, remove) {
      if (!/^WL-\d+$/.test(input.id || "")) throw new Error("A valid Dash lead ID is required.");
      const a = await getAuth();
      // Queue under the current account only; unsigned-in data stays local until a signed-in retry.
      if (!a) throw new Error("Sign in to sync the Lead log. Your lead is saved locally.");
      const stored = await chrome.storage.local.get([PENDING, CACHE]);
      const pending = stored[PENDING] || {};
      pending[key(a.uid, input.id)] = {
        id: input.id, uid: a.uid, remove,
        expect: stored[CACHE]?.items?.[input.id]?.updateTime || "",
        ...(remove ? {} : { record: sharedLead(input, a) }),
      };
      await chrome.storage.local.set({ [PENDING]: pending });
      await flush(a);
    }
    return {
      save: (lead) => serialize(() => enqueue(lead, false)),
      remove: (lead) => serialize(() => enqueue(lead, true)),
      refresh: () => serialize(async () => {
        const a = await auth();
        const items = {};
        let pageToken = "";
        do {
          const query = new URLSearchParams({ pageSize: "300" });
          if (pageToken) query.set("pageToken", pageToken);
          const response = await api(`${collection()}?${query}`);
          for (const doc of response.documents || []) {
            const record = decode(doc);
            // Older versions incorrectly uploaded viewed-only drafts as work.
            if (record.status === "new" && !Object.values(record.steps).some((timestamp) => timestamp > 0)) {
              await api(`${collection()}/${encodeURIComponent(record.id)}?${new URLSearchParams({
                "currentDocument.updateTime": record.updateTime,
              })}`, { method: "DELETE" });
              continue;
            }
            items[record.id] = record;
          }
          pageToken = response.nextPageToken || "";
        } while (pageToken);
        await chrome.storage.local.set({ [CACHE]: { items } });
        try {
          await flush(a);
        } catch (error) {
          if (["ALREADY_EXISTS", "FAILED_PRECONDITION"].includes(error.code)) {
            throw new Error("A teammate changed this lead. The Lead log was refreshed; review it and save your change again.");
          }
          throw error;
        }
      }),
    };
  };
  self.dashboardSharedLead = sharedLead;
})();
