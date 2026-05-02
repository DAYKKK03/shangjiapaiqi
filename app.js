const STORAGE_KEY = "merchant-content-ops-v1";
const SYNC_CONFIG_KEY = "merchant-ops-sync-config";

let supabaseClient = null;

const STAGES = [
  { id: "todo-script", label: "待写脚本" },
  { id: "todo-shoot", label: "待拍摄" },
  { id: "editing", label: "剪辑中" },
  { id: "delivery", label: "待交付" },
  { id: "done", label: "已完成" },
  { id: "overdue", label: "已逾期" },
];

const WEEKDAY_LABELS = {
  0: "周日",
  1: "周一",
  2: "周二",
  3: "周三",
  4: "周四",
  5: "周五",
  6: "周六",
};

const CALENDAR_WEEKDAY_ORDER = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

const SYSTEM_BATCH_PREFIX = "system-batch";

let state = loadState();
if (!state.selectedCalendarDate) {
  state.selectedCalendarDate = state.planningDate;
}
if (!state.calendarDate) {
  state.calendarDate = todayKey();
}

const refs = {
  metrics: document.getElementById("overview-metrics"),
  merchantCards: document.getElementById("merchant-cards"),
  alertList: document.getElementById("alert-list"),
  batchBoard: document.getElementById("batch-board"),
  calendarBoard: document.getElementById("calendar-board"),
  calendarMonthMeta: document.getElementById("calendar-month-meta"),
  calendarSelectedPanel: document.getElementById("calendar-selected-panel"),
  prevMonth: document.getElementById("prev-month"),
  todayMonth: document.getElementById("today-month"),
  nextMonth: document.getElementById("next-month"),
  planningDate: document.getElementById("planning-date"),
  merchantModal: document.getElementById("merchant-modal"),
  batchModal: document.getElementById("batch-modal"),
  syncModal: document.getElementById("sync-modal"),
  syncForm: document.getElementById("sync-form"),
  supabaseUrl: document.getElementById("supabase-url"),
  supabaseKey: document.getElementById("supabase-key"),
  merchantForm: document.getElementById("merchant-form"),
  batchForm: document.getElementById("batch-form"),
  merchantId: document.getElementById("merchant-id"),
  merchantName: document.getElementById("merchant-name"),
  merchantRuleType: document.getElementById("merchant-rule-type"),
  merchantInventory: document.getElementById("merchant-inventory"),
  merchantBatchOutput: document.getElementById("merchant-batch-output"),
  merchantNotes: document.getElementById("merchant-notes"),
  weekdaySelector: document.getElementById("weekday-selector"),
  merchantModalTitle: document.getElementById("merchant-modal-title"),
  batchId: document.getElementById("batch-id"),
  batchMerchantId: document.getElementById("batch-merchant-id"),
  batchPlannedCount: document.getElementById("batch-planned-count"),
  batchTargetDate: document.getElementById("batch-target-date"),
  batchStage: document.getElementById("batch-stage"),
  batchNotes: document.getElementById("batch-notes"),
  batchModalTitle: document.getElementById("batch-modal-title"),
};

init();

function init() {
  syncPlanningDateToToday();
  refs.planningDate.value = state.planningDate;
  initSupabase();
  bindEvents();
  // 初始化 Supabase 后，再同步日历日期到今天，确保不会被云端旧数据覆盖
  setTimeout(() => {
    syncCalendarDateToToday();
    render();
  }, 100);
}

function bindEvents() {
  refs.planningDate.addEventListener("change", (event) => {
    state.planningDate = event.target.value;
    persistState();
    render();
  });

  document.getElementById("reset-demo").addEventListener("click", () => {
    state = createDemoState();
    persistState();
    refs.planningDate.value = state.planningDate;
    render();
  });

  document.getElementById("export-data").addEventListener("click", exportData);
  document
    .getElementById("open-merchant-modal")
    .addEventListener("click", () => openMerchantModal());
  document
    .getElementById("open-batch-modal")
    .addEventListener("click", () => openBatchModal());

  document
    .getElementById("open-sync-modal")
    .addEventListener("click", () => openSyncModal());

  document.getElementById("test-sync").addEventListener("click", testAndSync);

  refs.merchantRuleType.addEventListener("change", toggleWeekdaySelector);

  refs.merchantForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveMerchant();
  });

  refs.batchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveBatch();
  });

  refs.syncForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveSyncConfig();
  });

  refs.prevMonth.addEventListener("click", () => {
    const current = new Date(`${state.calendarDate}T00:00:00`);
    current.setMonth(current.getMonth() - 1);
    state.calendarDate = toDateKey(current);
    persistState();
    render();
  });

  refs.todayMonth.addEventListener("click", () => {
    state.calendarDate = todayKey();
    persistState();
    render();
  });

  refs.nextMonth.addEventListener("click", () => {
    const current = new Date(`${state.calendarDate}T00:00:00`);
    current.setMonth(current.getMonth() + 1);
    state.calendarDate = toDateKey(current);
    persistState();
    render();
  });

  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => {
      document.getElementById(button.dataset.closeModal).close();
    });
  });
}

function render() {
  const merchantViews = state.merchants
    .map((merchant) => buildMerchantView(merchant, state.planningDate))
    .sort(sortMerchantsByRisk);
  const batchViews = buildBoardBatchViews(merchantViews, state.batches, state.planningDate);
  const calendarModel = buildCalendarMonth(merchantViews, batchViews, state.calendarDate);

  renderMetrics(merchantViews, batchViews);
  renderMerchantCards(merchantViews);
  renderAlerts(merchantViews, batchViews);
  renderBatchBoard(batchViews);
  renderCalendarBoard(calendarModel);
  renderCalendarSelectedPanel(calendarModel);
  populateMerchantOptions(merchantViews);
}

function renderMetrics(merchantViews, batchViews) {
  const totalInventory = merchantViews.reduce((sum, item) => sum + item.inventory, 0);
  const redCount = merchantViews.filter((item) => item.riskLevel === "red").length;
  const yellowCount = merchantViews.filter((item) => item.riskLevel === "yellow").length;
  const activeBatches = batchViews.filter((item) => !["done"].includes(item.stage)).length;

  const metrics = [
    { label: "商家总数", value: merchantViews.length },
    { label: "当前成片库存", value: `${totalInventory} 条` },
    { label: "高风险商家", value: `${redCount} 家` },
    { label: "在途批次", value: `${activeBatches} 个` },
  ];

  refs.metrics.innerHTML = metrics
    .map(
      (metric) => `
        <article class="metric-card">
          <span>${metric.label}</span>
          <strong>${metric.value}</strong>
        </article>
      `
    )
    .join("");
}

function renderMerchantCards(merchantViews) {
  refs.merchantCards.innerHTML = "";
  if (!merchantViews.length) {
    refs.merchantCards.innerHTML = '<div class="empty-state">还没有商家，先新建一个。</div>';
    return;
  }

  const template = document.getElementById("merchant-card-template");

  merchantViews.forEach((merchantView) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector(".merchant-rule").textContent = getRuleLabel(merchantView);
    node.querySelector(".merchant-name").textContent = merchantView.name;

    const riskPill = node.querySelector(".risk-pill");
    riskPill.textContent = merchantView.riskLabel;
    riskPill.classList.add(`risk-${merchantView.riskLevel}`);

    node.querySelector(".inventory-count").textContent = `${merchantView.inventory} 条`;
    node.querySelector(".safe-until").textContent = merchantView.safeUntilLabel;
    node.querySelector(".break-date").textContent = merchantView.breakDateLabel;

    const publishGrid = node.querySelector(".publish-grid");
    merchantView.publishDates.slice(0, 5).forEach((date, index) => {
      const card = document.createElement("div");
      card.className = "publish-card";
      card.innerHTML = `<span>未来第${index + 1}次</span><strong>${formatDate(date)}</strong>`;
      publishGrid.appendChild(card);
    });

    node.querySelector(".card-edit-button").addEventListener("click", () => {
      openMerchantModal(merchantView.raw);
    });

    node.querySelector(".inventory-button").addEventListener("click", () => {
      merchantView.raw.inventory += merchantView.raw.batchOutput;
      persistState();
      render();
    });

    node.querySelector(".batch-button").addEventListener("click", () => {
      openBatchModal({
        merchantId: merchantView.id,
        plannedCount: merchantView.raw.batchOutput,
        targetDate: merchantView.breakDate,
        stage: "todo-script",
      });
    });

    refs.merchantCards.appendChild(node);
  });
}

function renderAlerts(merchantViews, batchViews) {
  const alerts = [];

  merchantViews.forEach((merchant) => {
    if (merchant.riskLevel === "red") {
      alerts.push({
        title: `${merchant.name} 快断更了`,
        body: `当前库存只能撑到 ${merchant.safeUntilLabel}，${merchant.breakDateLabel} 必须接上新视频。`,
        status: "red",
      });
    } else if (merchant.riskLevel === "yellow") {
      alerts.push({
        title: `${merchant.name} 进入预警区`,
        body: `最晚 ${merchant.scriptDeadlineLabel} 要写本，断更日是 ${merchant.breakDateLabel}。`,
        status: "yellow",
      });
    }
  });

  batchViews.forEach((batch) => {
    if (batch.stage === "done") return;
    if (batch.overdue) {
      alerts.push({
        title: `${batch.name} 已逾期`,
        body: `当前阶段 ${batch.stageLabel} 已超过节点，目标接上日是 ${batch.targetDateLabel}。`,
        status: "red",
      });
    }
  });

  refs.alertList.innerHTML = "";

  if (!alerts.length) {
    refs.alertList.innerHTML = '<div class="empty-state">今天没有红黄风险，节奏很稳。</div>';
    return;
  }

  alerts.slice(0, 6).forEach((alert) => {
    const card = document.createElement("article");
    card.className = "alert-card";
    card.innerHTML = `
      <span class="risk-pill risk-${alert.status}">${alert.status === "red" ? "立即处理" : "尽快安排"}</span>
      <h3>${alert.title}</h3>
      <p>${alert.body}</p>
    `;
    refs.alertList.appendChild(card);
  });
}

function renderBatchBoard(batchViews) {
  refs.batchBoard.innerHTML = "";
  const template = document.getElementById("batch-column-template");
  if (!batchViews.length) {
    refs.batchBoard.innerHTML = '<div class="empty-state">暂无商家执行任务</div>';
    return;
  }

  batchViews.forEach((batch) => {
    const column = template.content.firstElementChild.cloneNode(true);
    column.querySelector(".batch-merchant").textContent = batch.merchantName;
    column.querySelector(".batch-name").textContent = batch.name;
    column.querySelector(".column-count").textContent = batch.stageLabel;

    const summary = column.querySelector(".merchant-plan-summary");
    summary.innerHTML = `
      <span class="meta-chip ${batch.overdue ? "meta-danger" : batch.daysToTarget <= 2 ? "meta-warn" : "meta-ok"}">
        ${batch.overdue ? "危险日期已到" : `距危险日 ${batch.daysToTarget} 天`}
      </span>
      <span class="meta-chip">还能发到 ${batch.safeUntilLabel}</span>
      <span class="meta-chip">${batch.plannedCount} 条库存补给</span>
    `;

    const editor = column.querySelector(".merchant-plan-editor");
    [
      ["写本", batch.scriptDate],
      ["拍摄", batch.shootDate],
      ["剪辑", batch.editDate],
    ].forEach(([label, value]) => {
      const wrapper = document.createElement("label");
      wrapper.className = "plan-date-card";
      wrapper.innerHTML = `<span>${label}日期</span><input type="date" value="${value}" />`;
      wrapper.querySelector("input").addEventListener("change", (event) => {
        updateBatchDates(batch, label, event.target.value);
      });
      editor.appendChild(wrapper);
    });

    const list = column.querySelector(".kanban-list");
    const stageSelect = document.createElement("select");
    stageSelect.className = "plan-stage-select";
    STAGES.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.label;
      option.selected = item.id === batch.stage;
      stageSelect.appendChild(option);
    });
    stageSelect.addEventListener("change", (event) => {
      updateBatchStage(batch, event.target.value);
    });
    list.appendChild(stageSelect);

    const actions = document.createElement("div");
    actions.className = "plan-actions";
    actions.innerHTML = `
      <button class="ghost-button plan-complete-button">完成并补库存</button>
      <button class="ghost-button plan-edit-button">编辑详情</button>
    `;
    actions.querySelector(".plan-complete-button").addEventListener("click", () => {
      const merchant = state.merchants.find((item) => item.id === batch.merchantId);
      if (batch.source === "manual" && batch.raw) {
        batch.raw.stage = "done";
      } else if (merchant) {
        merchant.planStage = "done";
      }
      if (merchant) {
        merchant.inventory += batch.plannedCount;
      }
      persistState();
      render();
    });
    actions.querySelector(".plan-edit-button").addEventListener("click", () => {
      openBatchModal(batch.raw || batch);
    });
    list.appendChild(actions);

    refs.batchBoard.appendChild(column);
  });
}

function renderCalendarBoard(calendarModel) {
  refs.calendarMonthMeta.innerHTML = `
    <strong class="calendar-month-title">${calendarModel.monthLabel}</strong>
    <span class="meta-chip">${calendarModel.currentMonthEventCount} 个当月节点</span>
  `;
  refs.calendarBoard.innerHTML = "";
  if (!calendarModel.cells.length) {
    refs.calendarBoard.innerHTML = '<div class="empty-state">未来 14 天暂无排期节点</div>';
    return;
  }

  const weekdayRow = document.createElement("div");
  weekdayRow.className = "calendar-weekdays";
  CALENDAR_WEEKDAY_ORDER.forEach((label) => {
    const item = document.createElement("div");
    item.className = "calendar-weekday";
    item.textContent = label;
    weekdayRow.appendChild(item);
  });
  refs.calendarBoard.appendChild(weekdayRow);

  const grid = document.createElement("div");
  grid.className = "calendar-grid";

  calendarModel.cells.forEach((day) => {
    const card = document.createElement("section");
    card.className = `calendar-day${day.isCurrentMonth ? "" : " is-outside-month"}${day.isToday ? " is-today" : ""}${day.date === state.selectedCalendarDate ? " is-selected" : ""}`;
    card.innerHTML = `
      <div class="calendar-day-head">
        <strong>${formatMonthDay(day.date)}</strong>
        <span class="meta-chip">${day.events.length} 个节点</span>
      </div>
      <div class="calendar-preview"></div>
    `;

    const preview = card.querySelector(".calendar-preview");
    preview.innerHTML = renderCalendarDayPreview(day);

    card.addEventListener("click", () => {
      state.selectedCalendarDate = day.date;
      persistState();
      render();
    });
    grid.appendChild(card);
  });

  refs.calendarBoard.appendChild(grid);
}

function renderCalendarSelectedPanel(calendarModel) {
  const selectedDay =
    calendarModel.cells.find((cell) => cell.date === state.selectedCalendarDate) ||
    calendarModel.cells.find((cell) => cell.isToday) ||
    calendarModel.cells[0];

  if (!selectedDay) {
    refs.calendarSelectedPanel.innerHTML = '<div class="empty-state">暂无日期详情</div>';
    return;
  }

  const dayLabel = selectedDay.date === state.planningDate ? "今日任务" : `${formatDate(selectedDay.date)} 任务`;
  refs.calendarSelectedPanel.innerHTML = `
    <div class="calendar-selected-head">
      <strong class="calendar-selected-title">${dayLabel}</strong>
      <div class="calendar-detail-meta">
        <span class="meta-chip">${selectedDay.events.length} 个节点</span>
        <span class="meta-chip">${selectedDay.isCurrentMonth ? "本月日期" : "跨月补齐日期"}</span>
      </div>
    </div>
    <div class="calendar-detail-list">
      ${
        selectedDay.events.length
          ? selectedDay.events
              .map(
                (event) => `
                  <article class="calendar-event ${event.className}">
                    <strong>${event.title}</strong>
                    <span>${event.detail}</span>
                  </article>
                `
              )
              .join("")
          : '<div class="empty-state">当天没有更新或危险节点</div>'
      }
    </div>
  `;
}

function buildMerchantView(merchant, planningDate) {
  const inventory = Number(merchant.inventory) || 0;
  const neededDates = Math.max(inventory + 5, 30);
  const publishDates = getNextPublishDates(merchant, planningDate, neededDates);
  const safeUntil = inventory > 0 ? publishDates[inventory - 1] ?? null : null;
  const breakDate = publishDates[inventory] ?? null;
  const scriptDeadline = breakDate ? shiftDate(breakDate, -3) : null;
  const shootDeadline = breakDate ? shiftDate(breakDate, -2) : null;
  const editDeadline = breakDate ? shiftDate(breakDate, -1) : null;
  const daysToBreak = breakDate ? diffDays(planningDate, breakDate) : null;
  const riskLevel = getRiskLevel(daysToBreak, inventory);

  return {
    id: merchant.id,
    name: merchant.name,
    inventory,
    publishDates,
    safeUntil,
    breakDate,
    scriptDeadline,
    shootDeadline,
    editDeadline,
    scriptDate: merchant.planScriptDate || scriptDeadline,
    shootDate: merchant.planShootDate || shootDeadline,
    editDate: merchant.planEditDate || editDeadline,
    planStage: merchant.planStage || getDefaultStage(planningDate, scriptDeadline, shootDeadline, editDeadline, breakDate),
    safeUntilLabel: safeUntil ? formatDate(safeUntil) : "无库存",
    breakDateLabel: breakDate ? formatDate(breakDate) : "未计算",
    scriptDeadlineLabel: scriptDeadline ? formatDate(scriptDeadline) : "未计算",
    shootDeadlineLabel: shootDeadline ? formatDate(shootDeadline) : "未计算",
    editDeadlineLabel: editDeadline ? formatDate(editDeadline) : "未计算",
    riskLevel,
    riskLabel: riskLevel === "red" ? "红色预警" : riskLevel === "yellow" ? "黄色预警" : "库存稳定",
    raw: merchant,
  };
}

function buildBatchView(batch, merchantViews) {
  const merchantView = merchantViews.find((item) => item.id === batch.merchantId);
  const targetDate = batch.targetDate;
  const scriptDeadline = batch.scriptDate || shiftDate(targetDate, -3);
  const shootDeadline = batch.shootDate || shiftDate(targetDate, -2);
  const editDeadline = batch.editDate || shiftDate(targetDate, -1);
  const planningDate = state.planningDate;
  const stageDeadline = getStageDeadline(batch.stage, { scriptDeadline, shootDeadline, editDeadline, targetDate });
  const overdue = batch.stage !== "done" && stageDeadline ? diffDays(planningDate, stageDeadline) < 0 : false;

  return {
    ...batch,
    id: batch.id,
    name: `${merchantView?.name ?? "未关联商家"}-${targetDate}`,
    merchantName: merchantView?.name ?? "未关联商家",
    merchantId: batch.merchantId,
    stageLabel: STAGES.find((item) => item.id === batch.stage)?.label ?? batch.stage,
    targetDateLabel: formatDate(targetDate),
    scriptDeadlineLabel: formatDate(batch.scriptDate || scriptDeadline),
    shootDeadlineLabel: formatDate(batch.shootDate || shootDeadline),
    editDeadlineLabel: formatDate(batch.editDate || editDeadline),
    safeUntilLabel: merchantView?.safeUntilLabel ?? "未计算",
    scriptDate: batch.scriptDate || scriptDeadline,
    shootDate: batch.shootDate || shootDeadline,
    editDate: batch.editDate || editDeadline,
    daysToTarget: diffDays(planningDate, targetDate),
    overdue,
    source: "manual",
    raw: batch,
  };
}

function buildBoardBatchViews(merchantViews, batches, planningDate) {
  const manualViews = batches
    .map((batch) => buildBatchView(batch, merchantViews))
    .sort((a, b) => a.targetDate.localeCompare(b.targetDate));
  const manualKeyMap = new Map(manualViews.map((item) => [getBatchMergeKey(item.merchantId, item.targetDate), item]));
  const mergedViews = [];

  merchantViews.forEach((merchantView) => {
    if (!merchantView.breakDate) return;
    const mergeKey = getBatchMergeKey(merchantView.id, merchantView.breakDate);
    if (manualKeyMap.has(mergeKey)) {
      mergedViews.push(manualKeyMap.get(mergeKey));
      return;
    }

    mergedViews.push(buildAutoBatchView(merchantView, planningDate));
  });

  return mergedViews.sort((a, b) => {
    const stageOrder = STAGES.findIndex((item) => item.id === a.stage) - STAGES.findIndex((item) => item.id === b.stage);
    return stageOrder !== 0 ? stageOrder : a.targetDate.localeCompare(b.targetDate);
  });
}

function buildAutoBatchView(merchantView, planningDate) {
  const targetDate = merchantView.breakDate;
  const stage = getAutoStageFromMerchant(merchantView, planningDate);
  return {
    id: `${SYSTEM_BATCH_PREFIX}-${merchantView.id}-${targetDate}`,
    merchantId: merchantView.id,
    merchantName: merchantView.name,
    plannedCount: merchantView.raw.batchOutput,
    targetDate,
    targetDateLabel: formatDate(targetDate),
    name: `${merchantView.name}-${targetDate}`,
    stage,
    stageLabel: STAGES.find((item) => item.id === stage)?.label ?? stage,
    safeUntilLabel: merchantView.safeUntilLabel,
    scriptDeadlineLabel: formatDate(merchantView.scriptDate),
    shootDeadlineLabel: formatDate(merchantView.shootDate),
    editDeadlineLabel: formatDate(merchantView.editDate),
    scriptDate: merchantView.scriptDate,
    shootDate: merchantView.shootDate,
    editDate: merchantView.editDate,
    daysToTarget: diffDays(planningDate, targetDate),
    overdue: stage === "overdue",
    source: "auto",
    raw: null,
  };
}

function getNextPublishDates(merchant, startDate, count) {
  const dates = [];
  let cursor = new Date(`${startDate}T00:00:00`);

  while (dates.length < count) {
    const dateKey = toDateKey(cursor);
    if (matchesRule(merchant, cursor)) {
      dates.push(dateKey);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function matchesRule(merchant, date) {
  const dayOfMonth = date.getDate();
  if (merchant.ruleType === "odd") {
    return dayOfMonth % 2 === 1;
  }
  if (merchant.ruleType === "even") {
    return dayOfMonth % 2 === 0;
  }
  if (merchant.ruleType === "weekdays") {
    return (merchant.weekdays || []).includes(date.getDay());
  }
  return false;
}

function getRiskLevel(daysToBreak, inventory) {
  if (inventory <= 0 || daysToBreak === null || daysToBreak <= 3) return "red";
  if (daysToBreak <= 7) return "yellow";
  return "green";
}

function getStageDeadline(stage, deadlines) {
  switch (stage) {
    case "todo-script":
      return deadlines.scriptDeadline;
    case "todo-shoot":
      return deadlines.shootDeadline;
    case "editing":
    case "delivery":
      return deadlines.editDeadline;
    default:
      return deadlines.targetDate;
  }
}

function getAutoStageFromMerchant(merchantView, planningDate) {
  return merchantView.planStage || getDefaultStage(
    planningDate,
    merchantView.scriptDate,
    merchantView.shootDate,
    merchantView.editDate,
    merchantView.breakDate
  );
}

function openMerchantModal(merchant) {
  refs.merchantForm.reset();
  clearWeekdaySelection();
  if (merchant) {
    refs.merchantModalTitle.textContent = "编辑商家";
    refs.merchantId.value = merchant.id;
    refs.merchantName.value = merchant.name;
    refs.merchantRuleType.value = merchant.ruleType;
    refs.merchantInventory.value = merchant.inventory;
    refs.merchantBatchOutput.value = merchant.batchOutput;
    refs.merchantNotes.value = merchant.notes || "";
    (merchant.weekdays || []).forEach((weekday) => {
      const checkbox = refs.weekdaySelector.querySelector(`input[value="${weekday}"]`);
      if (checkbox) checkbox.checked = true;
    });
  } else {
    refs.merchantModalTitle.textContent = "新建商家";
    refs.merchantId.value = "";
    refs.merchantBatchOutput.value = 3;
  }
  toggleWeekdaySelector();
  refs.merchantModal.showModal();
}

function saveMerchant() {
  const weekdays = Array.from(refs.weekdaySelector.querySelectorAll("input:checked")).map((input) =>
    Number(input.value)
  );
  const ruleType = refs.merchantRuleType.value;

  if (ruleType === "weekdays" && weekdays.length === 0) {
    window.alert("自定义周几模式至少要勾选一个发片日。");
    return;
  }

  const payload = {
    id: refs.merchantId.value || createId("merchant"),
    name: refs.merchantName.value.trim(),
    ruleType,
    weekdays,
    inventory: Number(refs.merchantInventory.value),
    batchOutput: Number(refs.merchantBatchOutput.value),
    notes: refs.merchantNotes.value.trim(),
    planScriptDate: existingMerchant(refs.merchantId.value)?.planScriptDate || "",
    planShootDate: existingMerchant(refs.merchantId.value)?.planShootDate || "",
    planEditDate: existingMerchant(refs.merchantId.value)?.planEditDate || "",
    planStage: existingMerchant(refs.merchantId.value)?.planStage || "",
  };

  const existingIndex = state.merchants.findIndex((merchant) => merchant.id === payload.id);
  if (existingIndex >= 0) {
    state.merchants[existingIndex] = payload;
  } else {
    state.merchants.push(payload);
  }

  persistState();
  refs.merchantModal.close();
  render();
}

function openBatchModal(batch) {
  if (state.merchants.length === 0) {
    window.alert("请先创建商家，再新建拍摄批次。");
    return;
  }

  refs.batchForm.reset();
  refs.batchMerchantId.innerHTML = "";
  populateMerchantOptions(state.merchants.map((merchant) => ({ id: merchant.id, name: merchant.name })));

  if (batch) {
    refs.batchModalTitle.textContent = batch.id && !String(batch.id).startsWith(SYSTEM_BATCH_PREFIX) ? "编辑拍摄批次" : "新建拍摄批次";
    refs.batchId.value = batch.id && !String(batch.id).startsWith(SYSTEM_BATCH_PREFIX) ? batch.id : "";
    refs.batchMerchantId.value = batch.merchantId || state.merchants[0]?.id || "";
    refs.batchPlannedCount.value = batch.plannedCount || 3;
    refs.batchTargetDate.value = batch.targetDate || state.planningDate;
    refs.batchStage.value = batch.stage || "todo-script";
    refs.batchNotes.value = batch.notes || "";
  } else {
    refs.batchModalTitle.textContent = "新建拍摄批次";
    refs.batchId.value = "";
    refs.batchMerchantId.value = state.merchants[0]?.id || "";
    refs.batchPlannedCount.value = 3;
    refs.batchTargetDate.value = state.planningDate;
    refs.batchStage.value = "todo-script";
  }

  refs.batchModal.showModal();
}

function saveBatch() {
  const merchant = state.merchants.find((item) => item.id === refs.batchMerchantId.value);
  const targetDate = refs.batchTargetDate.value;
  const payload = {
    id: refs.batchId.value || createId("batch"),
    merchantId: refs.batchMerchantId.value,
    plannedCount: Number(refs.batchPlannedCount.value),
    targetDate,
    stage: refs.batchStage.value,
    scriptDate: shiftDate(targetDate, -3),
    shootDate: shiftDate(targetDate, -2),
    editDate: shiftDate(targetDate, -1),
    notes: refs.batchNotes.value.trim() || (merchant ? `${merchant.name} 的 ${formatDate(targetDate)} 接档批次` : ""),
  };

  const existingIndex = state.batches.findIndex((item) => item.id === payload.id);
  if (existingIndex >= 0) {
    state.batches[existingIndex] = payload;
  } else {
    state.batches.push(payload);
  }

  persistState();
  refs.batchModal.close();
  render();
}

function populateMerchantOptions(merchantItems) {
  refs.batchMerchantId.innerHTML = merchantItems
    .map((merchant) => `<option value="${merchant.id}">${merchant.name}</option>`)
    .join("");
}

function toggleWeekdaySelector() {
  const isVisible = refs.merchantRuleType.value === "weekdays";
  refs.weekdaySelector.style.display = isVisible ? "grid" : "none";
}

function clearWeekdaySelection() {
  refs.weekdaySelector.querySelectorAll("input").forEach((checkbox) => {
    checkbox.checked = false;
  });
}

function getRuleLabel(merchantView) {
  const merchant = merchantView.raw;
  if (merchant.ruleType === "odd") return "单数日更新";
  if (merchant.ruleType === "even") return "双数日更新";
  return `周更 ${merchant.weekdays.map((day) => WEEKDAY_LABELS[day]).join(" / ")}`;
}

function sortMerchantsByRisk(a, b) {
  const order = { red: 0, yellow: 1, green: 2 };
  const leftBreakDate = a.breakDate || "9999-12-31";
  const rightBreakDate = b.breakDate || "9999-12-31";
  return order[a.riskLevel] - order[b.riskLevel] || leftBreakDate.localeCompare(rightBreakDate);
}

function getBatchMergeKey(merchantId, targetDate) {
  return `${merchantId}::${targetDate}`;
}

function existingMerchant(merchantId) {
  return state.merchants.find((merchant) => merchant.id === merchantId);
}

function updateBatchDates(batch, label, value) {
  if (!value) return;
  if (batch.source === "manual" && batch.raw) {
    if (label === "写本") batch.raw.scriptDate = value;
    if (label === "拍摄") batch.raw.shootDate = value;
    if (label === "剪辑") batch.raw.editDate = value;
  } else {
    const merchant = existingMerchant(batch.merchantId);
    if (!merchant) return;
    if (label === "写本") merchant.planScriptDate = value;
    if (label === "拍摄") merchant.planShootDate = value;
    if (label === "剪辑") merchant.planEditDate = value;
  }
  persistState();
  render();
}

function updateBatchStage(batch, stage) {
  if (batch.source === "manual" && batch.raw) {
    batch.raw.stage = stage;
  } else {
    const merchant = existingMerchant(batch.merchantId);
    if (!merchant) return;
    merchant.planStage = stage;
  }
  persistState();
  render();
}

function getDefaultStage(planningDate, scriptDate, shootDate, editDate, breakDate) {
  if (!breakDate) return "overdue";
  if (planningDate > breakDate) return "overdue";
  if (planningDate <= scriptDate) return "todo-script";
  if (planningDate <= shootDate) return "todo-shoot";
  if (planningDate <= editDate) return "editing";
  return "delivery";
}

function buildCalendarMonth(merchantViews, batchViews, calendarDate) {
  const eventsByDate = new Map();
  const currentDate = new Date(`${calendarDate}T00:00:00`);
  const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
  const startOffset = (monthStart.getDay() + 6) % 7;
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - startOffset);

  const totalCells = 42;
  for (let offset = 0; offset < totalCells; offset += 1) {
    const current = new Date(gridStart);
    current.setDate(gridStart.getDate() + offset);
    eventsByDate.set(toDateKey(current), []);
  }

  merchantViews.forEach((merchant) => {
    merchant.publishDates
      .filter((date) => eventsByDate.has(date))
      .forEach((date) => {
        eventsByDate.get(date).push({
          title: `${merchant.name} 更新日`,
          detail: `按规则正常发片，库存还能撑到 ${merchant.safeUntilLabel}`,
          className: "event-publish",
        });
      });

    if (merchant.breakDate && eventsByDate.has(merchant.breakDate)) {
      eventsByDate.get(merchant.breakDate).push({
        title: `${merchant.name} 危险日`,
        detail: `这天必须接上新视频，否则断更`,
        className: "event-danger",
      });
    }
  });

  batchViews.forEach((batch) => {
    [
      [batch.scriptDate, `${batch.merchantName} 写本`, `为 ${batch.targetDateLabel} 的接档任务准备脚本`],
      [batch.shootDate, `${batch.merchantName} 拍摄`, `拍摄 ${batch.plannedCount} 条库存补给`],
      [batch.editDate, `${batch.merchantName} 剪辑`, `剪辑完成后接上 ${batch.targetDateLabel}`],
    ].forEach(([date, title, detail]) => {
      if (date && eventsByDate.has(date)) {
        eventsByDate.get(date).push({
          title,
          detail,
          className: "event-plan",
        });
      }
    });
  });

  const realToday = todayKey();
  const cells = Array.from(eventsByDate.entries()).map(([date, events]) => {
    const rawDate = new Date(`${date}T00:00:00`);
    return {
      date,
      events,
      isCurrentMonth: rawDate.getMonth() === currentDate.getMonth(),
      isToday: date === realToday,
    };
  });

  return {
    monthLabel: `${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月`,
    currentMonthEventCount: cells
      .filter((cell) => cell.isCurrentMonth)
      .reduce((sum, cell) => sum + cell.events.length, 0),
    cells,
    monthStart: toDateKey(monthStart),
    monthEnd: toDateKey(monthEnd),
  };
}

function renderCalendarDayPreview(day) {
  if (!day.events.length) {
    return `
      <div class="calendar-event-count">无节点</div>
      <div class="calendar-dots"></div>
    `;
  }

  const dots = day.events
    .slice(0, 4)
    .map((event) => `<span class="calendar-dot ${getEventDotClass(event.className)}"></span>`)
    .join("");

  const label =
    day.date === state.planningDate ? "点击查看今日任务" : `点击查看 ${day.events.length} 个节点`;

  return `
    <div class="calendar-event-count">${label}</div>
    <div class="calendar-dots">${dots}</div>
  `;
}

function getEventDotClass(className) {
  if (className === "event-danger") return "dot-danger";
  if (className === "event-plan") return "dot-plan";
  return "dot-publish";
}

function shiftDate(dateKey, amount) {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setDate(date.getDate() + amount);
  return toDateKey(date);
}

function formatDate(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${month}-${day} ${WEEKDAY_LABELS[date.getDay()]}`;
}

function formatMonthDay(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${month}-${day}`;
}

function diffDays(fromDateKey, toDateKey) {
  const from = new Date(`${fromDateKey}T00:00:00`);
  const to = new Date(`${toDateKey}T00:00:00`);
  return Math.round((to - from) / 86400000);
}

function toDateKey(date) {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`;
}

function createId(prefix) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function todayKey() {
  return toDateKey(new Date());
}

function createDemoState() {
  return {
    planningDate: todayKey(),
    calendarDate: todayKey(),
    merchants: [
      {
        id: "merchant-miaoyan",
        name: "妙颜",
        ruleType: "even",
        weekdays: [],
        inventory: 3,
        batchOutput: 3,
        notes: "双数日更新",
      },
      {
        id: "merchant-baoji",
        name: "包记西点",
        ruleType: "odd",
        weekdays: [],
        inventory: 2,
        batchOutput: 3,
        notes: "单数日更新",
      },
      {
        id: "merchant-xishi",
        name: "西施竹韵",
        ruleType: "weekdays",
        weekdays: [1, 3, 5, 6, 0],
        inventory: 4,
        batchOutput: 3,
        notes: "周一/三/五/六/日更新",
      },
      {
        id: "merchant-chuanxiangju",
        name: "川香居麻辣鸡块",
        ruleType: "odd",
        weekdays: [],
        inventory: 1,
        batchOutput: 3,
        notes: "单数日更新",
      },
    ],
    batches: [],
  };
}

function syncPlanningDateToToday() {
  const calibratedToday = todayKey();
  if (state.planningDate !== calibratedToday) {
    state.planningDate = calibratedToday;
    persistState();
  }
}

function syncCalendarDateToToday() {
  const calibratedToday = todayKey();
  if (state.calendarDate !== calibratedToday) {
    state.calendarDate = calibratedToday;
    persistState();
  }
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  pushToCloud();
}

async function pushToCloud() {
  if (!supabaseClient) return;
  try {
    const { error } = await supabaseClient
      .from("app_state")
      .upsert({ id: 1, content: state, updated_at: new Date() });
    if (error) throw error;
    console.log("Synced to cloud");
  } catch (err) {
    console.error("Cloud sync failed:", err);
  }
}

async function pullFromCloud() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient
      .from("app_state")
      .select("content")
      .eq("id", 1)
      .single();
    if (error && error.code !== "PGRST116") throw error;
    if (data && data.content) {
      // 合并云端数据，但保留本地新增的字段
      state = {
        ...data.content,
        calendarDate: state.calendarDate,
      };
      // 确保 calendarDate 存在
      if (!state.calendarDate) {
        state.calendarDate = todayKey();
      }
      render();
      console.log("Pulled from cloud");
    }
  } catch (err) {
    console.error("Cloud pull failed:", err);
  }
}

function initSupabase() {
  const configRaw = localStorage.getItem(SYNC_CONFIG_KEY);
  if (!configRaw) return;
  try {
    const config = JSON.parse(configRaw);
    if (config.url && config.key) {
      supabaseClient = supabase.createClient(config.url, config.key);
      pullFromCloud();
    }
  } catch (err) {
    console.error("Failed to init Supabase:", err);
  }
}

function openSyncModal() {
  const configRaw = localStorage.getItem(SYNC_CONFIG_KEY);
  if (configRaw) {
    const config = JSON.parse(configRaw);
    refs.supabaseUrl.value = config.url || "";
    refs.supabaseKey.value = config.key || "";
  }
  refs.syncModal.showModal();
}

function saveSyncConfig() {
  const config = {
    url: refs.supabaseUrl.value.trim(),
    key: refs.supabaseKey.value.trim(),
  };
  localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(config));
  initSupabase();
  refs.syncModal.close();
}

async function testAndSync() {
  const url = refs.supabaseUrl.value.trim();
  const key = refs.supabaseKey.value.trim();
  if (!url || !key) {
    alert("请先填写 URL 和 Key");
    return;
  }

  const btn = document.getElementById("test-sync");
  const originalText = btn.textContent;
  btn.textContent = "同步中...";
  btn.disabled = true;

  try {
    const client = supabase.createClient(url, key);
    // 尝试读取数据
    const { data, error } = await client.from("app_state").select("*").limit(1);
    
    if (error) {
      if (error.message.includes("relation \"public.app_state\" does not exist")) {
        alert("连接成功，但数据库中缺少 'app_state' 表，请先在 Supabase 中创建该表。");
      } else {
        throw error;
      }
      return;
    }

    supabaseClient = client;
    localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify({ url, key }));
    await pullFromCloud();
    alert("同步成功！");
    refs.syncModal.close();
  } catch (err) {
    alert("连接失败: " + err.message);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return createDemoState();
  try {
    const parsed = JSON.parse(raw);
    return {
      planningDate: parsed.planningDate || todayKey(),
      selectedCalendarDate: parsed.selectedCalendarDate || parsed.planningDate || todayKey(),
      calendarDate: parsed.calendarDate || todayKey(),
      merchants: Array.isArray(parsed.merchants) ? parsed.merchants : [],
      batches: Array.isArray(parsed.batches) ? parsed.batches : [],
    };
  } catch (error) {
    console.warn("State parse failed, reset to demo.", error);
    return createDemoState();
  }
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  pushToCloud();
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `merchant-content-ops-${state.planningDate}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
