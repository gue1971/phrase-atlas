(function () {
  const KNOWLEDGE_LEVELS = [
    { value: "unread", label: "未読" },
    { value: "read", label: "既読" },
    { value: "settled", label: "定着" },
  ];
  const STORAGE_KEY = "phrase-atlas-knowledge";
  const BOOKMARK_STORAGE_KEY = "phrase-atlas-bookmarks";
  const DETAIL_FONT_STORAGE_KEY = "phrase-atlas-detail-font-large";
  const BACKUP_META_STORAGE_KEY = "phrase-atlas-backup-meta";
  const RESTORE_PROMPT_STORAGE_KEY = "phrase-atlas-restore-prompt-seen";
  const DEFAULT_PROGRESS_FILTERS = { unread: true, read: true, settled: true };
  const BACKUP_VERSION = 1;

  const state = {
    query: "",
    category: "all",
    knowledge: "all",
    progressFilters: { ...DEFAULT_PROGRESS_FILTERS },
    bookmarkOnly: false,
    sort: "fame",
    view: "detail",
    lastListView: "toc",
    lastDetailId: null,
    selectedPhrase: null,
    detailTextLarge: loadDetailTextLarge(),
    ratings: loadRatings(),
    bookmarks: loadBookmarks(),
    backupMeta: loadBackupMeta(),
    backupExportArmed: false,
    restorePromptSeen: localStorage.getItem(RESTORE_PROMPT_STORAGE_KEY) === "true",
  };

  const elements = {
    searchInput: document.querySelector("#searchInput"),
    categoryFilter: document.querySelector("#categoryFilter"),
    knowledgeFilter: document.querySelector("#knowledgeFilter"),
    topBar: document.querySelector("#topBar"),
    headerTitle: document.querySelector("#headerTitle"),
    settingsButton: document.querySelector("#settingsButton"),
    backupBadge: document.querySelector("#backupBadge"),
    bookmarkToggleButton: document.querySelector("#bookmarkToggleButton"),
    resetButton: document.querySelector("#resetButton"),
    applyFilterButton: document.querySelector("#applyFilterButton"),
    openFilterButton: document.querySelector("#openFilterButton"),
    footerLeft: document.querySelector("#footerLeft"),
    footerCenter: document.querySelector("#footerCenter"),
    footerRight: document.querySelector("#footerRight"),
    returnDetailButton: document.querySelector("#returnDetailButton"),
    viewToggleButton: document.querySelector("#viewToggleButton"),
    viewToggleIcon: document.querySelector("#viewToggleIcon"),
    tocList: document.querySelector("#tocList"),
    cardList: document.querySelector("#cardList"),
    emptyState: document.querySelector("#emptyState"),
    filterOverlay: document.querySelector("#filterOverlay"),
    settingsOverlay: document.querySelector("#settingsOverlay"),
    backupNotice: document.querySelector("#backupNotice"),
    settingsUnreadCount: document.querySelector("#settingsUnreadCount"),
    settingsReadCount: document.querySelector("#settingsReadCount"),
    settingsSettledCount: document.querySelector("#settingsSettledCount"),
    settingsBookmarkCount: document.querySelector("#settingsBookmarkCount"),
    lastBackupText: document.querySelector("#lastBackupText"),
    exportBackupButton: document.querySelector("#exportBackupButton"),
    importBackupButton: document.querySelector("#importBackupButton"),
    importBackupInput: document.querySelector("#importBackupInput"),
    closeSettingsButton: document.querySelector("#closeSettingsButton"),
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

  function loadDetailTextLarge() {
    return localStorage.getItem(DETAIL_FONT_STORAGE_KEY) === "true";
  }

  function saveDetailTextLarge() {
    localStorage.setItem(DETAIL_FONT_STORAGE_KEY, String(state.detailTextLarge));
  }

  function loadBackupMeta() {
    try {
      return JSON.parse(localStorage.getItem(BACKUP_META_STORAGE_KEY)) || null;
    } catch {
      return null;
    }
  }

  function saveBackupMeta(meta) {
    state.backupMeta = meta;
    localStorage.setItem(BACKUP_META_STORAGE_KEY, JSON.stringify(meta));
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

  function getAllProgressCounts() {
    return PHRASES.reduce(
      (counts, item) => {
        counts[normalizeRating(state.ratings[item.id])] += 1;
        return counts;
      },
      { unread: 0, read: 0, settled: 0 }
    );
  }

  function getRatedCount() {
    const counts = getAllProgressCounts();
    return counts.read + counts.settled;
  }

  function getBookmarkCount() {
    return Object.values(state.bookmarks).filter(Boolean).length;
  }

  function getSavedStateCount() {
    return getRatedCount() + getBookmarkCount();
  }

  function isFreshStateAfterPossibleClear() {
    return PHRASES.length >= 100 && getSavedStateCount() === 0 && !state.backupMeta?.exportedAt;
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
      const matchesKnowledge = Boolean(state.progressFilters[currentRating]);
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

  function getInitialPhrase() {
    return getUnreadRandomItem();
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
    const isListView = state.view === "toc" || state.view === "card";
    elements.emptyState.hidden = !isListView || filtered.length > 0;
    elements.detailOverlay.hidden = state.view !== "detail";
    elements.tocList.hidden = state.view !== "toc";
    elements.cardList.hidden = state.view !== "card";
    renderHeaderState();
    renderBookmarkToggle();
    elements.tocList.innerHTML = filtered.map(renderTocItem).join("");
    elements.cardList.innerHTML = filtered.map(renderCard).join("");
  }

  function renderHeaderState() {
    const titles = {
      detail: "ことばカルテ",
      toc: "目次",
      card: "カルテ一覧",
    };
    elements.headerTitle.textContent = titles[state.view] || "ことばカルテ";
    elements.viewToggleButton.setAttribute("aria-label", getViewToggleLabel());
    elements.viewToggleIcon.className = `toggle-icon ${getViewToggleIconClass()}`;
    document.body.classList.toggle("view-detail", state.view === "detail");
    renderFooterState();
    renderBackupBadge();
  }

  function getViewToggleLabel() {
    if (state.view === "detail") return "目次へ";
    if (state.view === "toc") return "カルテ一覧へ";
    return "目次へ";
  }

  function getViewToggleIconClass() {
    if (state.view === "toc") return "grid-icon";
    return "list-icon";
  }

  function renderBookmarkToggle() {
    const button = elements.bookmarkToggleButton;
    const icon = button.querySelector(".bookmark-toggle-icon");
    const detailId = state.selectedPhrase?.id;
    const active = state.view === "detail" && detailId ? isBookmarked(detailId) : state.bookmarkOnly;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute(
      "aria-label",
      state.view === "detail"
        ? `${state.selectedPhrase?.phrase || "このカルテ"}をブックマーク${active ? "解除" : ""}`
        : active
          ? "すべて表示"
          : "ブックマークのみ表示"
    );
    icon.textContent = active ? "★" : "☆";
  }

  function renderFooterState() {
    elements.footerLeft.replaceChildren();
    elements.footerCenter.replaceChildren();
    elements.footerRight.replaceChildren();

    if (state.view === "detail") {
      elements.settingsButton.hidden = false;
      elements.footerLeft.append(elements.settingsButton);
      elements.footerCenter.hidden = false;
      elements.footerCenter.innerHTML = `
        <div class="rating-row footer-rating">
          ${KNOWLEDGE_LEVELS.map((level) => `
            <button
              class="rating-button rating-${level.value} ${normalizeRating(state.ratings[state.selectedPhrase?.id]) === level.value ? "active" : ""}"
              type="button"
              data-action="rate"
              data-id="${escapeHtml(state.selectedPhrase?.id)}"
              data-value="${level.value}"
            >${escapeHtml(level.label)}</button>
          `).join("")}
        </div>
      `;
      elements.footerRight.append(elements.bookmarkToggleButton, elements.viewToggleButton);
      elements.returnDetailButton.hidden = true;
      elements.openFilterButton.hidden = true;
      return;
    }

    elements.footerCenter.hidden = false;
    elements.footerCenter.innerHTML = renderProgressChips();
    elements.returnDetailButton.hidden = !state.lastDetailId;
    elements.returnDetailButton.disabled = !state.lastDetailId;
    elements.openFilterButton.hidden = false;
    elements.settingsButton.hidden = true;
    elements.footerLeft.append(elements.returnDetailButton, elements.viewToggleButton);
    elements.footerRight.append(elements.bookmarkToggleButton, elements.openFilterButton);
  }

  function shouldRecommendBackup() {
    if (getBackupRisk()) return true;
    const meta = state.backupMeta;
    if (!meta?.exportedAt) return getRatedCount() > 0 || getBookmarkCount() > 0;
    const ratedDelta = getRatedCount() - (meta.ratedCount || 0);
    const bookmarkDelta = getBookmarkCount() - (meta.bookmarkCount || 0);
    const daysSinceBackup = (Date.now() - new Date(meta.exportedAt).getTime()) / 86400000;
    return ratedDelta >= 10 || bookmarkDelta >= 5 || daysSinceBackup >= 7;
  }

  function getBackupRisk() {
    const currentTotal = getSavedStateCount();
    const metaRated = state.backupMeta?.ratedCount || 0;
    const metaBookmarks = state.backupMeta?.bookmarkCount || 0;
    const metaTotal = metaRated + metaBookmarks;

    if (isFreshStateAfterPossibleClear()) {
      return "進捗とお気に入りが空です。過去に使っていた場合は、保存より先にバックアップから復元してください。";
    }

    if (!state.backupMeta?.exportedAt && currentTotal > 0 && currentTotal < 20) {
      return "この端末には前回バックアップの記録がありません。履歴消去後の可能性がある場合は、保存より先に復元を確認してください。";
    }

    if (metaTotal >= 20 && currentTotal <= Math.max(5, Math.floor(metaTotal * 0.7))) {
      return `前回バックアップ時は進捗・お気に入りが合計${metaTotal}件でした。現在は${currentTotal}件なので、大きく減っています。`;
    }

    return "";
  }

  function renderBackupBadge() {
    const recommended = shouldRecommendBackup();
    elements.backupBadge.hidden = !recommended;
    elements.settingsButton.classList.toggle("needs-backup", recommended);
    elements.settingsButton.setAttribute("aria-label", recommended ? "保守・設定を開く。バックアップ推奨" : "保守・設定を開く");
  }

  function getProgressCounts() {
    const query = state.query.trim().toLowerCase();
    return PHRASES.filter((item) => {
      const matchesQuery = !query || getSearchText(item).includes(query);
      const matchesCategory = state.category === "all" || item.category === state.category;
      const matchesBookmark = !state.bookmarkOnly || isBookmarked(item.id);
      return matchesQuery && matchesCategory && matchesBookmark;
    }).reduce(
      (counts, item) => {
        counts[normalizeRating(state.ratings[item.id])] += 1;
        return counts;
      },
      { unread: 0, read: 0, settled: 0 }
    );
  }

  function renderProgressChips() {
    const counts = getProgressCounts();
    return `
      <div class="footer-progress" aria-label="学習進捗">
        ${KNOWLEDGE_LEVELS.map((level) => `
          <span
            class="progress-chip progress-${level.value} ${state.progressFilters[level.value] ? "active" : ""}"
            role="button"
            tabindex="0"
            data-action="toggle-progress-filter"
            data-value="${level.value}"
            aria-pressed="${state.progressFilters[level.value]}"
            aria-label="${escapeHtml(level.label)} ${counts[level.value]}"
            title="${escapeHtml(level.label)} ${counts[level.value]}"
          >${counts[level.value]}</span>
        `).join("")}
      </div>
    `;
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
    document.body.classList.toggle("detail-large-text", state.detailTextLarge);
    elements.detailContent.innerHTML = `
      <header
        class="detail-header"
        role="button"
        tabindex="0"
        data-action="toggle-detail-text"
        aria-label="詳細本文の文字サイズを${state.detailTextLarge ? "標準" : "大きく"}する"
        aria-pressed="${state.detailTextLarge}"
      >
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
            <span class="related-title">次のカルテ</span>
            <small>まだ読んでいないことば</small>
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
    if (state.view === "toc" || state.view === "card") state.lastListView = state.view;
    state.selectedPhrase = item;
    state.lastDetailId = item.id;
    state.view = "detail";
    renderDetail(item);
    elements.detailOverlay.hidden = false;
    elements.detailContent.querySelector(".detail-body")?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0, behavior: "smooth" });
    renderCards();
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

  function openSettings() {
    renderSettingsPanel();
    elements.settingsOverlay.hidden = false;
    document.body.classList.add("modal-open");
  }

  function openRestorePromptIfNeeded() {
    if (state.restorePromptSeen || !isFreshStateAfterPossibleClear()) return;
    state.restorePromptSeen = true;
    localStorage.setItem(RESTORE_PROMPT_STORAGE_KEY, "true");
    window.setTimeout(openSettings, 250);
  }

  function closeSettings() {
    elements.settingsOverlay.hidden = true;
    document.body.classList.remove("modal-open");
    resetBackupExportGuard();
  }

  function renderSettingsPanel() {
    const counts = getAllProgressCounts();
    const risk = getBackupRisk();
    elements.settingsUnreadCount.textContent = counts.unread;
    elements.settingsReadCount.textContent = counts.read;
    elements.settingsSettledCount.textContent = counts.settled;
    elements.settingsBookmarkCount.textContent = getBookmarkCount();
    elements.lastBackupText.textContent = state.backupMeta?.exportedAt
      ? `最終バックアップ: ${new Date(state.backupMeta.exportedAt).toLocaleString("ja-JP")}`
      : "最終バックアップ: 未実施";
    const recommended = shouldRecommendBackup();
    elements.backupNotice.hidden = !recommended;
    elements.backupNotice.textContent = risk || (recommended
      ? "バックアップ推奨です。進捗やお気に入りが増えています。"
      : "");
    elements.exportBackupButton.textContent = state.backupExportArmed ? "この状態で保存" : "保存";
    elements.exportBackupButton.classList.toggle("danger-button", state.backupExportArmed);
  }

  function resetBackupExportGuard() {
    state.backupExportArmed = false;
    elements.exportBackupButton.textContent = "保存";
    elements.exportBackupButton.classList.remove("danger-button");
  }

  function guardBackupExport() {
    const risk = getBackupRisk();
    if (!risk) {
      resetBackupExportGuard();
      return true;
    }
    if (state.backupExportArmed) return true;

    state.backupExportArmed = true;
    elements.backupNotice.hidden = false;
    elements.backupNotice.textContent = `${risk} 問題なければ、もう一度「この状態で保存」を押してください。`;
    elements.exportBackupButton.textContent = "この状態で保存";
    elements.exportBackupButton.classList.add("danger-button");
    return false;
  }

  function createBackupPayload() {
    return {
      app: "kotoba-karute",
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      knowledge: state.ratings,
      bookmarks: state.bookmarks,
      settings: {
        detailFontLarge: state.detailTextLarge,
      },
    };
  }

  function formatBackupFileTimestamp(date) {
    const pad = (value) => String(value).padStart(2, "0");
    return [
      date.getFullYear(),
      `${pad(date.getMonth() + 1)}${pad(date.getDate())}`,
      `${pad(date.getHours())}${pad(date.getMinutes())}`,
    ].join("-");
  }

  function exportBackup() {
    if (!guardBackupExport()) return;
    const payload = createBackupPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `kotoba-karute-${formatBackupFileTimestamp(new Date())}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    saveBackupMeta({
      exportedAt: payload.exportedAt,
      ratedCount: getRatedCount(),
      bookmarkCount: getBookmarkCount(),
    });
    state.restorePromptSeen = true;
    localStorage.setItem(RESTORE_PROMPT_STORAGE_KEY, "true");
    resetBackupExportGuard();
    renderSettingsPanel();
    renderBackupBadge();
  }

  function importBackupFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      try {
        const payload = JSON.parse(String(reader.result || "{}"));
        if (payload.app !== "kotoba-karute" || typeof payload !== "object") throw new Error("invalid backup");
        state.ratings = sanitizeRatings(payload.knowledge);
        state.bookmarks = sanitizeBookmarks(payload.bookmarks);
        state.detailTextLarge = Boolean(payload.settings?.detailFontLarge);
        saveRatings();
        saveBookmarks();
        saveDetailTextLarge();
        saveBackupMeta({
          exportedAt: new Date().toISOString(),
          ratedCount: getRatedCount(),
          bookmarkCount: getBookmarkCount(),
        });
        state.restorePromptSeen = true;
        localStorage.setItem(RESTORE_PROMPT_STORAGE_KEY, "true");
        resetBackupExportGuard();
        document.body.classList.toggle("detail-large-text", state.detailTextLarge);
        renderSettingsPanel();
        renderCards();
        if (state.selectedPhrase) {
          state.selectedPhrase = PHRASES.find((item) => item.id === state.selectedPhrase.id) || state.selectedPhrase;
          renderDetail(state.selectedPhrase);
        }
      } catch {
        elements.backupNotice.hidden = false;
        elements.backupNotice.textContent = "バックアップファイルを読み込めませんでした。";
      } finally {
        elements.importBackupInput.value = "";
      }
    });
    reader.readAsText(file);
  }

  function sanitizeRatings(value) {
    if (!value || typeof value !== "object") return {};
    return Object.fromEntries(
      Object.entries(value)
        .map(([id, rating]) => [id, normalizeRating(rating)])
        .filter(([id]) => PHRASES.some((item) => item.id === id))
    );
  }

  function sanitizeBookmarks(value) {
    if (!value || typeof value !== "object") return {};
    const phraseIds = new Set(PHRASES.map((item) => item.id));
    return Object.fromEntries(Object.entries(value).filter(([id, active]) => phraseIds.has(id) && active));
  }

  function closeDetail() {
    elements.detailOverlay.hidden = true;
    state.selectedPhrase = null;
    state.view = state.lastListView;
    renderCards();
  }

  function setRating(id, value) {
    state.ratings[id] = value;
    saveRatings();
    renderCards();
    if (state.selectedPhrase?.id === id) renderDetail(state.selectedPhrase);
  }

  function toggleDetailTextSize() {
    state.detailTextLarge = !state.detailTextLarge;
    saveDetailTextLarge();
    document.body.classList.toggle("detail-large-text", state.detailTextLarge);
    if (state.selectedPhrase) renderDetail(state.selectedPhrase);
  }

  function syncKnowledgeSelectToProgressFilters() {
    const activeLevels = KNOWLEDGE_LEVELS.filter((level) => state.progressFilters[level.value]).map((level) => level.value);
    state.knowledge = activeLevels.length === 1 ? activeLevels[0] : "all";
    elements.knowledgeFilter.value = state.knowledge;
  }

  function toggleProgressFilter(value) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_PROGRESS_FILTERS, value)) return;
    state.progressFilters[value] = !state.progressFilters[value];
    syncKnowledgeSelectToProgressFilters();
    renderCards();
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
      state.progressFilters = event.target.value === "all"
        ? { ...DEFAULT_PROGRESS_FILTERS }
        : { unread: false, read: false, settled: false, [event.target.value]: true };
      renderCards();
    });

    elements.bookmarkToggleButton.addEventListener("click", () => {
      if (state.view === "detail" && state.selectedPhrase) {
        toggleBookmark(state.selectedPhrase.id);
        return;
      }
      state.bookmarkOnly = !state.bookmarkOnly;
      renderCards();
    });

    elements.resetButton.addEventListener("click", () => {
      state.query = "";
      state.category = "all";
      state.knowledge = "all";
      state.progressFilters = { ...DEFAULT_PROGRESS_FILTERS };
      state.bookmarkOnly = false;
      state.sort = "fame";
      state.view = "toc";
      state.lastListView = "toc";
      state.selectedPhrase = null;
      elements.searchInput.value = "";
      elements.categoryFilter.value = "all";
      elements.knowledgeFilter.value = "all";
      renderCards();
    });

    elements.viewToggleButton.addEventListener("click", () => {
      if (state.view === "detail") {
        state.lastListView = "toc";
        closeDetail();
        return;
      }
      state.view = state.view === "toc" ? "card" : "toc";
      state.lastListView = state.view;
      state.selectedPhrase = null;
      renderCards();
    });

    elements.returnDetailButton.addEventListener("click", () => {
      if (state.lastDetailId) openDetail(state.lastDetailId);
    });

    elements.openFilterButton.addEventListener("click", openFilter);
    elements.applyFilterButton.addEventListener("click", closeFilter);
    elements.settingsButton.addEventListener("click", openSettings);
    elements.closeSettingsButton.addEventListener("click", closeSettings);
    elements.exportBackupButton.addEventListener("click", exportBackup);
    elements.importBackupButton.addEventListener("click", () => elements.importBackupInput.click());
    elements.importBackupInput.addEventListener("change", (event) => importBackupFile(event.target.files?.[0]));
    elements.topBar.addEventListener("click", () => {
      if (state.view === "detail") toggleDetailTextSize();
    });

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
      if (action === "toggle-progress-filter") toggleProgressFilter(actionTarget.dataset.value);
      if (action === "toggle-detail-text") toggleDetailTextSize();
      if (action === "close-detail") closeDetail();
    });

    elements.detailContent.addEventListener("keydown", (event) => {
      if ((event.key === "Enter" || event.key === " ") && event.target.closest('[data-action="toggle-detail-text"]')) {
        event.preventDefault();
        toggleDetailTextSize();
      }
    });

    elements.footerCenter.addEventListener("keydown", (event) => {
      const progressTarget = event.target.closest('[data-action="toggle-progress-filter"]');
      if ((event.key === "Enter" || event.key === " ") && progressTarget) {
        event.preventDefault();
        toggleProgressFilter(progressTarget.dataset.value);
      }
    });

    elements.filterOverlay.addEventListener("click", (event) => {
      if (event.target === elements.filterOverlay) closeFilter();
    });
    elements.settingsOverlay.addEventListener("click", (event) => {
      if (event.target === elements.settingsOverlay) closeSettings();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !elements.filterOverlay.hidden) closeFilter();
      if (event.key === "Escape" && !elements.settingsOverlay.hidden) closeSettings();
    });
  }

  renderSelectOptions();
  bindEvents();
  openDetail(getInitialPhrase().id);
  renderCards();
  openRestorePromptIfNeeded();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      let reloadingForUpdate = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloadingForUpdate) return;
        reloadingForUpdate = true;
        window.location.reload();
      });

      navigator.serviceWorker
        .register("./sw.js")
        .then((registration) => registration.update())
        .catch(() => {});
    });
  }
})();
