(function () {
  'use strict';

  // Domain values are JSON-compatible objects. No references escape storage boundaries.
  const clone = value => JSON.parse(JSON.stringify(value));

  function createDomain(key, seed) {
    const initial = clone(seed);

    function save(value) {
      const next = clone(value);
      localStorage.setItem(key, JSON.stringify(next));
      return clone(next);
    }

    function reset() {
      return save(initial);
    }

    function get() {
      const raw = localStorage.getItem(key);
      if (raw === null) return reset();
      try {
        return clone(JSON.parse(raw));
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        return reset();
      }
    }

    // Replace or append a record by identity within one named collection.
    function upsert(collection, record, idField = 'id') {
      const next = get();
      const item = clone(record);
      if (item[idField] === undefined || item[idField] === null) {
        throw new TypeError('A record identity is required.');
      }
      if (!Object.hasOwn(next, collection)) next[collection] = [];
      if (!Array.isArray(next[collection])) throw new TypeError('Collection must be an array.');
      const index = next[collection].findIndex(entry => entry[idField] === item[idField]);
      if (index === -1) next[collection].push(item);
      else next[collection][index] = item;
      return save(next);
    }

    get(); // Initialize or recover only this domain's storage key.
    return Object.freeze({ get, save, reset, snapshot: get, restore: save, upsert });
  }

  window.State = Object.freeze({ createDomain });
}());
