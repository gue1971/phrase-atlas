(function () {
  const KNOWLEDGE_LEVELS = [
    { value: "unread", label: "未読" },
    { value: "read", label: "既読" },
    { value: "settled", label: "定着" },
  ];
  const STORAGE_KEY = "phrase-atlas-knowledge";
  const BOOKMARK_STORAGE_KEY = "phrase-atlas-bookmarks";

  const state = {
    query: "",
    category: "all",
    knowledge: "all",
    bookmarkOnly: false,
    sort: "fame",
    view: "toc",
    selectedPhrase: null,
    ratings: loadRatings(),
    bookmarks: loadBookmarks(),
  };

  const elements = {
    searchInput: document.querySelector("#searchInput"),
    categoryFilter: document.querySelector("#categoryFilter"),
    knowledgeFilter: document.querySelector("#knowledgeFilter"),
    bookmarkOnlyFilter: document.querySelector("#bookmarkOnlyFilter"),
    sortSelect: document.querySelector("#sortSelect"),
    randomButton: document.querySelector("#randomButton"),
    resetButton: document.querySelector("#resetButton"),
    openFilterButton: document.querySelector("#openFilterButton"),
    closeFilterButton: document.querySelector("#closeFilterButton"),
    tocViewButton: document.querySelector("#tocViewButton"),
    cardViewButton: document.querySelector("#cardViewButton"),
    tocList: document.querySelector("#tocList"),
    cardList: document.querySelector("#cardList"),
    emptyState: document.querySelector("#emptyState"),
    filterOverlay: document.querySelector("#filterOverlay"),
    detailOverlay: document.querySelector("#detailOverlay"),
    detailContent: document.querySelector("#detailContent"),
  };

  function loadRatings() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveRatings() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.ratings));
  }

  function loadBookmarks() {
    try {
      return JSON.parse(localStorage.getItem(BOOKMARK_STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveBookmarks() {
    localStorage.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify(state.bookmarks));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatValue(value) {
    if (Array.isArray(value)) return value.length ? value.join("、") : "未設定";
    if (value === null || value === undefined || value === "") return "未設定";
    if (typeof value === "number" && value < 0) return `紀元前${Math.abs(value)}年`;
    return value;
  }

  function getRatingLabel(id) {
    const rating = normalizeRating(state.ratings[id]);
    return KNOWLEDGE_LEVELS.find((item) => item.value === rating)?.label || "未読";
  }

  function normalizeRating(value) {
    if (value === "heard" || value === "vague") return "read";
    if (value === "explain") return "settled";
    return KNOWLEDGE_LEVELS.some((item) => item.value === value) ? value : "unread";
  }

  function getSearchText(item) {
    return [
      item.phrase,
      item.original,
      item.person,
      item.person_en,
      item.summary,
      item.explanation,
      item.note,
      item.category,
      ...item.tags,
      ...item.fields,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  function isBookmarked(id) {
    return Boolean(state.bookmarks[id]);
  }

  function getFilteredPhrases() {
    const query = state.query.trim().toLowerCase();
    return PHRASES.filter((item) => {
      const matchesQuery = !query || getSearchText(item).includes(query);
      const matchesCategory = state.category === "all" || item.category === state.category;
      const currentRating = normalizeRating(state.ratings[item.id]);
      const matchesKnowledge = state.knowledge === "all" || currentRating === state.knowledge;
      const matchesBookmark = !state.bookmarkOnly || isBookmarked(item.id);
      return matchesQuery && matchesCategory && matchesKnowledge && matchesBookmark;
    }).sort((a, b) => {
      if (state.sort === "year") {
        const yearA = a.year ?? 99999;
        const yearB = b.year ?? 99999;
        return yearA - yearB || a.phrase.localeCompare(b.phrase, "ja");
      }
      if (state.sort === "person") {
        return a.person.localeCompare(b.person, "ja") || b.fame - a.fame;
      }
      return b.fame - a.fame || a.phrase.localeCompare(b.phrase, "ja");
    });
  }

  function getRandomPhrases() {
    const query = state.query.trim().toLowerCase();
    const scoped = PHRASES.filter((item) => {
      const matchesQuery = !query || getSearchText(item).includes(query);
      const matchesCategory = state.category === "all" || item.category === state.category;
      return matchesQuery && matchesCategory;
    });
    const source = scoped.length ? scoped : PHRASES;
    const unread = source.filter((item) => normalizeRating(state.ratings[item.id]) === "unread");
    return unread.length ? unread : source;
  }

  function getRelatedPhrases(item, limit = 7) {
    const itemFields = new Set(item.fields);
    const itemTags = new Set(item.tags);

    return PHRASES.filter((candidate) => candidate.id !== item.id)
      .map((candidate) => {
        let score = 0;
        if (candidate.category === item.category) score += 2;
        if (candidate.person === item.person) score += 4;
        if (candidate.work && candidate.work === item.work) score += 3;
        for (const field of candidate.fields) {
          if (itemFields.has(field)) score += 3;
        }
        for (const tag of candidate.tags) {
          if (itemTags.has(tag)) score += 2;
        }
        return { ...candidate, relatedScore: score };
      })
      .filter((candidate) => candidate.relatedScore > 2)
      .sort((a, b) => b.relatedScore - a.relatedScore || b.fame - a.fame || a.phrase.localeCompare(b.phrase, "ja"))
      .slice(0, limit);
  }

  function getUnreadRandomItem(excludeId) {
    const unread = PHRASES.filter((item) => item.id !== excludeId && normalizeRating(state.ratings[item.id]) === "unread");
    const source = unread.length ? unread : PHRASES.filter((item) => item.id !== excludeId);
    return source[Math.floor(Math.random() * source.length)];
  }

  function renderSelectOptions() {
    const categories = [...new Set(PHRASES.map((item) => item.category))].sort((a, b) => a.localeCompare(b, "ja"));
    elements.categoryFilter.innerHTML = [
      '<option value="all">すべて</option>',
      ...categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`),
    ].join("");

    elements.knowledgeFilter.innerHTML = [
      '<option value="all">すべて</option>',
      ...KNOWLEDGE_LEVELS.map((level) => `<option value="${level.value}">${escapeHtml(level.label)}</option>`),
    ].join("");
  }

  function renderCards() {
    const filtered = getFilteredPhrases();
    elements.emptyState.hidden = filtered.length > 0;
    elements.tocList.hidden = state.view !== "toc";
    elements.cardList.hidden = state.view !== "card";
    elements.tocViewButton.classList.toggle("active", state.view === "toc");
    elements.cardViewButton.classList.toggle("active", state.view === "card");
    elements.tocList.innerHTML = filtered.map(renderTocItem).join("");
    elements.cardList.innerHTML = filtered.map(renderCard).join("");
  }

  function renderTocItem(item) {
    const rating = normalizeRating(state.ratings[item.id]);
    return `
      <article class="toc-item" data-id="${escapeHtml(item.id)}">
        <button class="toc-main" type="button" data-action="open" data-id="${escapeHtml(item.id)}">
          <span class="toc-title">${escapeHtml(item.phrase)}</span>
          <span class="toc-sub">${escapeHtml(item.person)}${item.year ? ` / ${escapeHtml(formatValue(item.year))}` : ""}</span>
        </button>
        <span class="toc-category">${escapeHtml(item.category)}</span>
        <span class="toc-rating rating-${escapeHtml(rating)}">${escapeHtml(getRatingLabel(item.id))}</span>
        ${bookmarkButton(item)}
      </article>
    `;
  }

  function renderCard(item) {
    const summary = item.summary.length > 88 ? `${item.summary.slice(0, 88)}...` : item.summary;
    return `
      <article class="phrase-card" data-id="${escapeHtml(item.id)}">
        <button class="card-main" type="button" data-action="open" data-id="${escapeHtml(item.id)}">
          <span class="card-meta">
            <span class="badge">${escapeHtml(item.category)}</span>
            <span class="stars" aria-label="有名度 ${item.fame}">${"★".repeat(item.fame)}${"☆".repeat(5 - item.fame)}</span>
          </span>
          <span class="phrase-title">${escapeHtml(item.phrase)}</span>
          <span class="person-line">${escapeHtml(item.person)}${item.year ? ` / ${escapeHtml(formatValue(item.year))}` : ""}</span>
          <span class="summary-line">${escapeHtml(summary)}</span>
        </button>
        <div class="card-tools">
          ${bookmarkButton(item)}
        </div>
        <div class="rating-row" aria-label="${escapeHtml(item.phrase)}の知ってる度">
          ${KNOWLEDGE_LEVELS.map((level) => `
            <button
              class="rating-button ${normalizeRating(state.ratings[item.id]) === level.value ? "active" : ""}"
              type="button"
              data-action="rate"
              data-id="${escapeHtml(item.id)}"
              data-value="${level.value}"
            >${escapeHtml(level.label)}</button>
          `).join("")}
        </div>
      </article>
    `;
  }

  function bookmarkButton(item) {
    const active = isBookmarked(item.id);
    return `
      <button
        class="bookmark-button ${active ? "active" : ""}"
        type="button"
        data-action="bookmark"
        data-id="${escapeHtml(item.id)}"
        aria-label="${escapeHtml(item.phrase)}をブックマーク${active ? "解除" : ""}"
        aria-pressed="${active}"
      >${active ? "★" : "☆"}</button>
    `;
  }

  function renderDetail(item) {
    const related = getRelatedPhrases(item);
    elements.detailContent.innerHTML = `
      <header class="detail-header">
        <div>
          <div class="detail-kicker">
            <span class="eyebrow">${escapeHtml(item.category)}</span>
            <span class="stars" aria-label="有名度 ${item.fame}">${"★".repeat(item.fame)}${"☆".repeat(5 - item.fame)}</span>
          </div>
          <h2 id="detailTitle">${escapeHtml(item.phrase)}</h2>
          <p class="original">${escapeHtml(formatValue(item.original))}</p>
          <div class="detail-labels">
            <span class="status-badge status-${escapeHtml(item.status)}">${escapeHtml(item.status)}</span>
            ${item.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
          </div>
          <p class="detail-summary">${escapeHtml(item.summary)}</p>
        </div>
      </header>

      <div class="detail-body">
        <div class="detail-grid">
          ${detailPersonRow(item)}
          ${detailRow("関連年", item.year)}
          ${detailRow("著作", item.work)}
          ${detailRow("分野", item.fields)}
        </div>

        <section class="explanation-section">
          <h3>解説</h3>
          <p>${escapeHtml(item.explanation || "未設定")}</p>
        </section>

        <section class="note-section">
          <h3>注意・補足</h3>
          <p>${escapeHtml(item.note)}</p>
        </section>

        ${renderRelatedSection(related, item.id)}
      </div>

      <footer class="detail-footer">
        ${bookmarkButton(item)}
        <div class="rating-row detail-rating">
          ${KNOWLEDGE_LEVELS.map((level) => `
            <button
              class="rating-button ${normalizeRating(state.ratings[item.id]) === level.value ? "active" : ""}"
              type="button"
              data-action="rate-close"
              data-id="${escapeHtml(item.id)}"
              data-value="${level.value}"
            >${escapeHtml(level.label)}</button>
          `).join("")}
        </div>
        <button id="closeDetailButton" class="close-button" type="button" data-action="close-detail" aria-label="詳細を閉じる">×</button>
      </footer>
    `;
  }

  function renderRelatedSection(items, currentId) {
    return `
      <section class="related-section" aria-label="関連語">
        <h3>関連語</h3>
        <div class="related-list">
          ${items.map((item) => `
            <button class="related-link" type="button" data-action="open" data-id="${escapeHtml(item.id)}">
              <span class="related-title">${escapeHtml(item.phrase)}</span>
              <small>${escapeHtml(item.category)} / ${escapeHtml(item.person)}</small>
              <span class="related-rating rating-${escapeHtml(normalizeRating(state.ratings[item.id]))}">
                ${escapeHtml(getRatingLabel(item.id))}
              </span>
            </button>
          `).join("")}
          <button class="related-link related-random" type="button" data-action="open-random-unread" data-exclude-id="${escapeHtml(currentId)}">
            <span class="related-title">未読を一枚</span>
            <small>新しいことばへ広げる</small>
            <span class="related-rating rating-unread">未読</span>
          </button>
        </div>
      </section>
    `;
  }

  function detailRow(label, value) {
    return `
      <div class="detail-row">
        <dt>${escapeHtml(label)}</dt>
        <dd>${escapeHtml(formatValue(value))}</dd>
      </div>
    `;
  }

  function detailPersonRow(item) {
    return `
      <div class="detail-row person-detail">
        <dt>人物・由来</dt>
        <dd>
          <span>${escapeHtml(formatValue(item.person))}</span>
          <small>${escapeHtml(formatValue(item.person_en))}</small>
        </dd>
      </div>
    `;
  }

  function openDetail(id) {
    const item = PHRASES.find((phrase) => phrase.id === id);
    if (!item) return;
    state.selectedPhrase = item;
    renderDetail(item);
    elements.detailOverlay.hidden = false;
    document.body.classList.add("modal-open");
    elements.detailContent.querySelector(".detail-body")?.scrollTo({ top: 0 });
    document.querySelector("#closeDetailButton")?.focus();
  }

  function openFilter() {
    elements.filterOverlay.hidden = false;
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => {
      elements.searchInput.focus();
      elements.searchInput.select();
    });
  }

  function closeFilter() {
    elements.filterOverlay.hidden = true;
    document.body.classList.remove("modal-open");
  }

  function closeDetail() {
    elements.detailOverlay.hidden = true;
    document.body.classList.remove("modal-open");
    state.selectedPhrase = null;
  }

  function setRating(id, value) {
    state.ratings[id] = value;
    saveRatings();
    renderCards();
    if (state.selectedPhrase?.id === id) renderDetail(state.selectedPhrase);
  }

  function toggleBookmark(id) {
    if (isBookmarked(id)) {
      delete state.bookmarks[id];
    } else {
      state.bookmarks[id] = true;
    }
    saveBookmarks();
    renderCards();
    if (state.selectedPhrase?.id === id) renderDetail(state.selectedPhrase);
  }

  function bindEvents() {
    elements.searchInput.addEventListener("input", (event) => {
      state.query = event.target.value;
      renderCards();
    });

    elements.categoryFilter.addEventListener("change", (event) => {
      state.category = event.target.value;
      renderCards();
    });

    elements.knowledgeFilter.addEventListener("change", (event) => {
      state.knowledge = event.target.value;
      renderCards();
    });

    elements.bookmarkOnlyFilter.addEventListener("change", (event) => {
      state.bookmarkOnly = event.target.checked;
      renderCards();
    });

    elements.sortSelect.addEventListener("change", (event) => {
      state.sort = event.target.value;
      renderCards();
    });

    elements.randomButton.addEventListener("click", () => {
      const source = getRandomPhrases();
      const randomItem = source[Math.floor(Math.random() * source.length)];
      openDetail(randomItem.id);
    });

    elements.resetButton.addEventListener("click", () => {
      state.query = "";
      state.category = "all";
      state.knowledge = "all";
      state.bookmarkOnly = false;
      state.sort = "fame";
      state.view = "toc";
      elements.searchInput.value = "";
      elements.categoryFilter.value = "all";
      elements.knowledgeFilter.value = "all";
      elements.bookmarkOnlyFilter.checked = false;
      elements.sortSelect.value = "fame";
      renderCards();
    });

    elements.tocViewButton.addEventListener("click", () => {
      state.view = "toc";
      renderCards();
    });

    elements.cardViewButton.addEventListener("click", () => {
      state.view = "card";
      renderCards();
    });

    elements.openFilterButton.addEventListener("click", openFilter);
    elements.closeFilterButton.addEventListener("click", closeFilter);

    document.addEventListener("click", (event) => {
      const actionTarget = event.target.closest("[data-action]");
      if (!actionTarget) return;
      const action = actionTarget.dataset.action;
      const id = actionTarget.dataset.id;
      if (action === "open") openDetail(id);
      if (action === "rate") setRating(id, actionTarget.dataset.value);
      if (action === "bookmark") toggleBookmark(id);
      if (action === "open-random-unread") {
        const randomItem = getUnreadRandomItem(actionTarget.dataset.excludeId);
        if (randomItem) openDetail(randomItem.id);
      }
      if (action === "rate-close") {
        setRating(id, actionTarget.dataset.value);
        closeDetail();
      }
      if (action === "close-detail") closeDetail();
    });

    elements.detailOverlay.addEventListener("click", (event) => {
      if (event.target === elements.detailOverlay) closeDetail();
    });
    elements.filterOverlay.addEventListener("click", (event) => {
      if (event.target === elements.filterOverlay) closeFilter();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !elements.detailOverlay.hidden) closeDetail();
      if (event.key === "Escape" && !elements.filterOverlay.hidden) closeFilter();
    });
  }

  renderSelectOptions();
  bindEvents();
  renderCards();
})();
