import React, { useState, useEffect, useMemo, useCallback } from "react";
import * as XLSX from "xlsx";
import { doc, onSnapshot, setDoc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Trash2,
  Download,
  Users,
  Settings,
  Plus,
  CalendarDays,
  Loader2,
  Lock,
  KeyRound,
} from "lucide-react";

/* ---------------------------------------------------------
   テーマ（配色・タイポグラフィ）
--------------------------------------------------------- */
const THEME = {
  bg: "#F3F5FA",
  surface: "#FFFFFF",
  surfaceAlt: "#EBEFF7",
  ink: "#1C2333",
  inkSub: "#6B7280",
  inkFaint: "#A2A9B8",
  primary: "#2F4B8F",
  primarySoft: "#E5EAF7",
  primaryLine: "#C4D0EC",
  sunday: "#D2495A",
  saturday: "#1D8A99",
  border: "#DFE3EC",
  pending: "#DB9A2C",
  pendingBg: "#FBF1DD",
  approved: "#2A9D74",
  approvedBg: "#E2F4EC",
  rejected: "#D2495A",
  rejectedBg: "#FBE7E9",
};

const FONT_BODY =
  "'Hiragino Kaku Gothic ProN','Hiragino Sans','Yu Gothic Medium','Noto Sans JP',system-ui,sans-serif";
const FONT_NUM = "'Roboto Mono',ui-monospace,SFMono-Regular,monospace";

const MAX_PER_MONTH = 3;
const MAX_PER_DAY = 8;
const DEFAULT_ADMIN_PIN = "1234";
const WEEK_LABEL = ["日", "月", "火", "水", "木", "金", "土"];
const STATUS_LABEL = { pending: "申請中", approved: "承認", rejected: "却下" };
const STATUS_COLOR = {
  pending: { fg: THEME.pending, bg: THEME.pendingBg },
  approved: { fg: THEME.approved, bg: THEME.approvedBg },
  rejected: { fg: THEME.rejected, bg: THEME.rejectedBg },
};

const DEFAULT_EMPLOYEES = [
  "佐藤 一郎",
  "鈴木 花子",
  "高橋 大輔",
  "田中 美咲",
  "伊藤 健太",
  "渡辺 直樹",
];

// Firestore のドキュメント参照（コレクション "kibokyu" の中に3つのドキュメント）
const employeesRef = doc(db, "kibokyu", "employees");
const requestsRef = doc(db, "kibokyu", "requests");
const settingsRef = doc(db, "kibokyu", "settings");

/* ---------------------------------------------------------
   日付ユーティリティ
--------------------------------------------------------- */
const pad2 = (n) => String(n).padStart(2, "0");
const toKey = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
const monthKey = (y, m) => `${y}-${pad2(m + 1)}`;
const todayKey = () => {
  const t = new Date();
  return toKey(t.getFullYear(), t.getMonth(), t.getDate());
};

function buildMonthGrid(year, month) {
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, key: toKey(year, month, d), dow: new Date(year, month, d).getDay() });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/* ---------------------------------------------------------
   小さな UI パーツ
--------------------------------------------------------- */
function Toast({ message, tone = "info", onClose }) {
  if (!message) return null;
  const toneColor =
    tone === "error" ? THEME.rejected : tone === "success" ? THEME.approved : THEME.primary;
  return (
    <div
      className="fixed left-1/2 top-3 z-50 -translate-x-1/2 px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 transition-all"
      style={{ backgroundColor: THEME.ink, color: "#fff", maxWidth: "92vw" }}
      onClick={onClose}
    >
      <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: toneColor }} />
      <span className="text-sm leading-snug">{message}</span>
    </div>
  );
}

function Badge({ status }) {
  const c = STATUS_COLOR[status];
  return (
    <span
      className="px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0"
      style={{ color: c.fg, backgroundColor: c.bg }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function MonthNav({ year, month, onPrev, onNext }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <button
        onClick={onPrev}
        className="w-9 h-9 flex items-center justify-center rounded-full active:scale-95 transition"
        style={{ backgroundColor: THEME.surfaceAlt, color: THEME.ink }}
        aria-label="前の月"
      >
        <ChevronLeft size={18} />
      </button>
      <div className="font-bold tabular-nums" style={{ fontSize: 18, color: THEME.ink, fontFamily: FONT_NUM }}>
        {year}年 {month + 1}月
      </div>
      <button
        onClick={onNext}
        className="w-9 h-9 flex items-center justify-center rounded-full active:scale-95 transition"
        style={{ backgroundColor: THEME.surfaceAlt, color: THEME.ink }}
        aria-label="次の月"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

/* ---------------------------------------------------------
   社員画面
--------------------------------------------------------- */
function EmployeeView({ employees, requests, saveRequests, notify }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [name, setName] = useState("");
  const [newDates, setNewDates] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => setNewDates([]), [name, year, month]);

  const mKey = monthKey(year, month);
  const grid = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const tKey = todayKey();

  const myExisting = useMemo(
    () =>
      requests
        .filter((r) => r.name === name && r.date.startsWith(mKey))
        .sort((a, b) => (a.date < b.date ? -1 : 1)),
    [requests, name, mKey]
  );
  const activeExistingCount = myExisting.filter((r) => r.status !== "rejected").length;
  const usedCount = activeExistingCount + newDates.length;
  const remaining = MAX_PER_MONTH - usedCount;

  const existingDateSet = useMemo(
    () => new Set(myExisting.filter((r) => r.status !== "rejected").map((r) => r.date)),
    [myExisting]
  );

  // 日付ごとの全社員の申請人数（申請中＋承認済み）
  const dailyCount = useMemo(() => {
    const map = {};
    requests
      .filter((r) => r.status !== "rejected")
      .forEach((r) => {
        map[r.date] = (map[r.date] || 0) + 1;
      });
    return map;
  }, [requests]);

  const toggleDate = (cell) => {
    if (!name) {
      notify("先に名前を選択してください", "error");
      return;
    }
    if (!cell || cell.key < tKey) return;
    if (existingDateSet.has(cell.key)) {
      notify("この日はすでに申請済みです（下の一覧から取消できます）", "error");
      return;
    }
    if (newDates.includes(cell.key)) {
      setNewDates(newDates.filter((d) => d !== cell.key));
      return;
    }
    if (remaining <= 0) {
      notify(`希望休は月${MAX_PER_MONTH}日までです`, "error");
      return;
    }
    if ((dailyCount[cell.key] || 0) >= MAX_PER_DAY) {
      notify(`この日はすでに希望者が${MAX_PER_DAY}名に達しています。別の日をお選びください`, "error");
      return;
    }
    setNewDates([...newDates, cell.key].sort());
  };

  const submit = async () => {
    if (!name) return notify("名前を選択してください", "error");
    if (newDates.length === 0) return notify("カレンダーから希望日を選んでください", "error");
    setSubmitting(true);
    const created = newDates.map((d) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      date: d,
      status: "pending",
      createdAt: new Date().toISOString(),
    }));
    const ok = await saveRequests([...requests, ...created]);
    setSubmitting(false);
    if (ok) {
      setNewDates([]);
      notify("希望休を送信しました", "success");
    } else {
      notify("送信に失敗しました。もう一度お試しください", "error");
    }
  };

  const cancelOne = async (id) => {
    const ok = await saveRequests(requests.filter((r) => r.id !== id));
    if (ok) notify("申請を取り消しました", "success");
    else notify("取消に失敗しました", "error");
  };

  const goPrev = () => {
    if (month === 0) {
      setYear(year - 1);
      setMonth(11);
    } else setMonth(month - 1);
  };
  const goNext = () => {
    if (month === 11) {
      setYear(year + 1);
      setMonth(0);
    } else setMonth(month + 1);
  };

  return (
    <div className="max-w-md mx-auto px-4 pb-28 pt-4 space-y-4">
      {/* 名前選択 */}
      <div className="rounded-2xl p-4" style={{ backgroundColor: THEME.surface, boxShadow: "0 1px 2px rgba(28,35,51,0.06)" }}>
        <label className="text-xs font-semibold block mb-1.5" style={{ color: THEME.inkSub }}>
          名前
        </label>
        <select
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl px-3 py-3 text-base font-medium outline-none border"
          style={{ borderColor: THEME.border, color: THEME.ink, backgroundColor: THEME.surface }}
        >
          <option value="">選択してください</option>
          {employees.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      </div>

      {/* 残り日数 */}
      {name && (
        <div
          className="rounded-2xl p-4 flex items-center justify-between"
          style={{ backgroundColor: THEME.primarySoft, border: `1px solid ${THEME.primaryLine}` }}
        >
          <div>
            <div className="text-xs font-semibold" style={{ color: THEME.primary }}>
              {month + 1}月の希望休
            </div>
            <div className="text-xs mt-0.5" style={{ color: THEME.inkSub }}>
              上限 {MAX_PER_MONTH} 日 / 選択中 {newDates.length} 日
            </div>
          </div>
          <div
            className="rounded-full flex items-center justify-center flex-shrink-0"
            style={{
              width: 56,
              height: 56,
              backgroundColor: remaining > 0 ? THEME.primary : THEME.rejected,
              color: "#fff",
            }}
          >
            <div className="text-center leading-none">
              <div className="font-bold tabular-nums" style={{ fontSize: 20, fontFamily: FONT_NUM }}>
                {Math.max(remaining, 0)}
              </div>
              <div style={{ fontSize: 9 }}>残り</div>
            </div>
          </div>
        </div>
      )}

      {/* カレンダー */}
      <div className="rounded-2xl p-4" style={{ backgroundColor: THEME.surface, boxShadow: "0 1px 2px rgba(28,35,51,0.06)" }}>
        <MonthNav year={year} month={month} onPrev={goPrev} onNext={goNext} />
        <div className="grid grid-cols-7 gap-1 mt-3">
          {WEEK_LABEL.map((w, i) => (
            <div
              key={w}
              className="text-center text-xs font-semibold py-1"
              style={{ color: i === 0 ? THEME.sunday : i === 6 ? THEME.saturday : THEME.inkSub }}
            >
              {w}
            </div>
          ))}
          {grid.map((cell, i) => {
            if (!cell) return <div key={i} />;
            const isPast = cell.key < tKey;
            const isNew = newDates.includes(cell.key);
            const existingReq = myExisting.find((r) => r.date === cell.key && r.status !== "rejected");
            const isFull = !existingReq && !isNew && (dailyCount[cell.key] || 0) >= MAX_PER_DAY;
            const dowColor = cell.dow === 0 ? THEME.sunday : cell.dow === 6 ? THEME.saturday : THEME.ink;

            let style = { color: isPast ? THEME.inkFaint : dowColor, backgroundColor: "transparent", border: "1px solid transparent" };
            if (isNew) style = { color: "#fff", backgroundColor: THEME.primary, border: `1px solid ${THEME.primary}` };
            else if (existingReq) {
              const c = STATUS_COLOR[existingReq.status];
              style = { color: c.fg, backgroundColor: c.bg, border: `1px solid ${c.fg}33` };
            } else if (isFull) {
              style = { color: THEME.inkFaint, backgroundColor: THEME.surfaceAlt, border: `1px solid ${THEME.border}` };
            }

            return (
              <button
                key={i}
                disabled={isPast}
                onClick={() => toggleDate(cell)}
                className="aspect-square rounded-lg flex flex-col items-center justify-center text-sm font-semibold transition active:scale-95 disabled:active:scale-100"
                style={{ ...style, cursor: isPast ? "not-allowed" : "pointer", fontFamily: FONT_NUM }}
              >
                <span>{cell.day}</span>
                {isFull && <span style={{ fontSize: 8, lineHeight: 1 }}>満枠</span>}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3 mt-3 text-xs" style={{ color: THEME.inkSub }}>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded" style={{ backgroundColor: THEME.primary }} /> 選択中
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded" style={{ backgroundColor: THEME.pendingBg, border: `1px solid ${THEME.pending}` }} /> 申請中
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded" style={{ backgroundColor: THEME.approvedBg, border: `1px solid ${THEME.approved}` }} /> 承認済
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded" style={{ backgroundColor: THEME.surfaceAlt, border: `1px solid ${THEME.border}` }} /> 満枠（{MAX_PER_DAY}名）
          </span>
        </div>
      </div>

      {/* 自分の申請状況 */}
      {name && myExisting.length > 0 && (
        <div className="rounded-2xl p-4" style={{ backgroundColor: THEME.surface, boxShadow: "0 1px 2px rgba(28,35,51,0.06)" }}>
          <div className="text-xs font-semibold mb-2" style={{ color: THEME.inkSub }}>
            {month + 1}月の申請状況
          </div>
          <div className="space-y-2">
            {myExisting.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-xl px-3 py-2" style={{ backgroundColor: THEME.surfaceAlt }}>
                <span className="text-sm font-medium tabular-nums" style={{ color: THEME.ink, fontFamily: FONT_NUM }}>
                  {r.date.slice(5).replace("-", "/")}
                </span>
                <div className="flex items-center gap-2">
                  <Badge status={r.status} />
                  {r.status === "pending" && (
                    <button
                      onClick={() => cancelOne(r.id)}
                      className="w-7 h-7 flex items-center justify-center rounded-full active:scale-90 transition"
                      style={{ color: THEME.inkSub }}
                      aria-label="取消"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 送信ボタン（固定） */}
      <div className="fixed bottom-0 left-0 right-0 px-4 py-3" style={{ backgroundColor: `${THEME.bg}ee`, backdropFilter: "blur(6px)" }}>
        <div className="max-w-md mx-auto">
          <button
            onClick={submit}
            disabled={submitting || !name || newDates.length === 0}
            className="w-full py-3.5 rounded-2xl font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-40"
            style={{ backgroundColor: THEME.primary, color: "#fff" }}
          >
            {submitting ? <Loader2 size={18} className="animate-spin" /> : null}
            {newDates.length > 0 ? `${newDates.length}日分を送信` : "送信"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   管理者ロック画面（PIN認証）
--------------------------------------------------------- */
function AdminLock({ correctPin, onUnlock }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  const submit = () => {
    if (pin === correctPin) {
      onUnlock();
    } else {
      setError(true);
      setPin("");
    }
  };

  return (
    <div className="max-w-sm mx-auto px-4 pt-16 text-center">
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
        style={{ backgroundColor: THEME.primarySoft, color: THEME.primary }}
      >
        <Lock size={22} />
      </div>
      <h2 className="font-bold mb-1" style={{ fontSize: 17, color: THEME.ink }}>
        管理者用PINコード
      </h2>
      <p className="text-sm mb-5" style={{ color: THEME.inkSub }}>
        承認・却下や社員リストの編集には認証が必要です
      </p>
      <input
        type="password"
        inputMode="numeric"
        value={pin}
        onChange={(e) => {
          setPin(e.target.value);
          setError(false);
        }}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="PINコードを入力"
        autoFocus
        className="w-full text-center tracking-[0.4em] rounded-xl px-3 py-3 text-lg font-semibold outline-none border"
        style={{ borderColor: error ? THEME.rejected : THEME.border, color: THEME.ink }}
      />
      {error && (
        <p className="text-xs mt-2" style={{ color: THEME.rejected }}>
          PINコードが違います
        </p>
      )}
      <button
        onClick={submit}
        disabled={!pin}
        className="w-full mt-4 py-3 rounded-xl font-bold text-base active:scale-[0.98] transition disabled:opacity-40"
        style={{ backgroundColor: THEME.primary, color: "#fff" }}
      >
        入る
      </button>
    </div>
  );
}

/* ---------------------------------------------------------
   管理者画面
--------------------------------------------------------- */
function AdminView({ employees, saveEmployees, requests, saveRequests, adminPin, saveAdminPin, notify }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [newPin, setNewPin] = useState("");

  const mKey = monthKey(year, month);
  const grid = useMemo(() => buildMonthGrid(year, month), [year, month]);

  const monthRequests = useMemo(() => requests.filter((r) => r.date.startsWith(mKey)), [requests, mKey]);

  const headcount = useMemo(() => {
    const map = {};
    monthRequests
      .filter((r) => r.status !== "rejected")
      .forEach((r) => {
        map[r.date] = (map[r.date] || 0) + 1;
      });
    return map;
  }, [monthRequests]);

  const filtered = useMemo(() => {
    return monthRequests
      .filter((r) => (statusFilter === "all" ? true : r.status === statusFilter))
      .filter((r) => (dateFilter ? r.date === dateFilter : true))
      .sort((a, b) => (a.date === b.date ? a.name.localeCompare(b.name, "ja") : a.date < b.date ? -1 : 1));
  }, [monthRequests, statusFilter, dateFilter]);

  const grouped = useMemo(() => {
    const g = {};
    filtered.forEach((r) => {
      if (!g[r.date]) g[r.date] = [];
      g[r.date].push(r);
    });
    return Object.entries(g).sort(([a], [b]) => (a < b ? -1 : 1));
  }, [filtered]);

  const updateStatus = async (id, status) => {
    const ok = await saveRequests(requests.map((r) => (r.id === id ? { ...r, status } : r)));
    if (!ok) notify("更新に失敗しました", "error");
  };

  const goPrev = () => {
    if (month === 0) {
      setYear(year - 1);
      setMonth(11);
    } else setMonth(month - 1);
    setDateFilter(null);
  };
  const goNext = () => {
    if (month === 11) {
      setYear(year + 1);
      setMonth(0);
    } else setMonth(month + 1);
    setDateFilter(null);
  };

  const exportExcel = () => {
    const rows = filtered.map((r) => ({
      氏名: r.name,
      日付: r.date,
      ステータス: STATUS_LABEL[r.status],
      申請日時: new Date(r.createdAt).toLocaleString("ja-JP"),
    }));
    if (rows.length === 0) {
      notify("出力する申請がありません", "error");
      return;
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${year}年${month + 1}月`);
    XLSX.writeFile(wb, `希望休_${year}${pad2(month + 1)}.xlsx`);
    notify("Excelファイルを出力しました", "success");
  };

  const addNames = async () => {
    const names = bulkText
      .split(/[\n,、]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length === 0) return;
    const merged = Array.from(new Set([...employees, ...names]));
    const ok = await saveEmployees(merged);
    if (ok) {
      setBulkText("");
      notify(`${names.length}名を追加しました`, "success");
    } else notify("追加に失敗しました", "error");
  };

  const removeName = async (n) => {
    const ok = await saveEmployees(employees.filter((e) => e !== n));
    if (!ok) notify("削除に失敗しました", "error");
  };

  const changePin = async () => {
    if (!/^[0-9]{4,8}$/.test(newPin)) {
      notify("PINコードは4〜8桁の数字で入力してください", "error");
      return;
    }
    const ok = await saveAdminPin(newPin);
    if (ok) {
      setNewPin("");
      notify("PINコードを変更しました", "success");
    } else notify("変更に失敗しました", "error");
  };

  const filterChips = [
    { key: "all", label: "すべて" },
    { key: "pending", label: "申請中" },
    { key: "approved", label: "承認" },
    { key: "rejected", label: "却下" },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 pb-10 pt-4 space-y-4">
      {/* 月ナビ + Excel出力 */}
      <div className="rounded-2xl p-4" style={{ backgroundColor: THEME.surface, boxShadow: "0 1px 2px rgba(28,35,51,0.06)" }}>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <MonthNav year={year} month={month} onPrev={goPrev} onNext={goNext} />
          </div>
          <button
            onClick={exportExcel}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold active:scale-95 transition"
            style={{ backgroundColor: THEME.approvedBg, color: THEME.approved }}
          >
            <Download size={16} />
            Excel
          </button>
        </div>
      </div>

      {/* 同日人数カレンダー */}
      <div className="rounded-2xl p-4" style={{ backgroundColor: THEME.surface, boxShadow: "0 1px 2px rgba(28,35,51,0.06)" }}>
        <div className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: THEME.inkSub }}>
          <Users size={14} /> 日別の人数（タップして絞り込み）
        </div>
        <div className="grid grid-cols-7 gap-1">
          {WEEK_LABEL.map((w, i) => (
            <div key={w} className="text-center text-xs font-semibold py-1" style={{ color: i === 0 ? THEME.sunday : i === 6 ? THEME.saturday : THEME.inkSub }}>
              {w}
            </div>
          ))}
          {grid.map((cell, i) => {
            if (!cell) return <div key={i} />;
            const count = headcount[cell.key] || 0;
            const isSelected = dateFilter === cell.key;
            let ring = "transparent";
            if (count >= MAX_PER_DAY) ring = THEME.rejected;
            else if (count >= MAX_PER_DAY - 2) ring = THEME.pending;
            return (
              <button
                key={i}
                onClick={() => setDateFilter(isSelected ? null : cell.key)}
                className="aspect-square rounded-lg flex flex-col items-center justify-center transition active:scale-95"
                style={{
                  backgroundColor: isSelected ? THEME.primary : count > 0 ? THEME.surfaceAlt : "transparent",
                  border: `1.5px solid ${isSelected ? THEME.primary : ring}`,
                }}
              >
                <span
                  className="text-xs font-semibold"
                  style={{ color: isSelected ? "#fff" : cell.dow === 0 ? THEME.sunday : cell.dow === 6 ? THEME.saturday : THEME.ink, fontFamily: FONT_NUM }}
                >
                  {cell.day}
                </span>
                {count > 0 && (
                  <span
                    className="font-bold tabular-nums"
                    style={{ fontSize: 11, color: isSelected ? "#fff" : count >= MAX_PER_DAY ? THEME.rejected : count >= MAX_PER_DAY - 2 ? THEME.pending : THEME.inkSub, fontFamily: FONT_NUM }}
                  >
                    {count}人
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3 mt-3 text-xs" style={{ color: THEME.inkSub }}>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded" style={{ border: `1.5px solid ${THEME.pending}` }} /> 残り2名以内（{MAX_PER_DAY - 2}〜{MAX_PER_DAY - 1}人）
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded" style={{ border: `1.5px solid ${THEME.rejected}` }} /> 上限到達（{MAX_PER_DAY}人以上）
          </span>
        </div>
      </div>

      {/* ステータスフィルタ */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {filterChips.map((c) => (
          <button
            key={c.key}
            onClick={() => setStatusFilter(c.key)}
            className="px-3.5 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition flex-shrink-0"
            style={
              statusFilter === c.key
                ? { backgroundColor: THEME.primary, color: "#fff" }
                : { backgroundColor: THEME.surfaceAlt, color: THEME.inkSub }
            }
          >
            {c.label}
          </button>
        ))}
        {dateFilter && (
          <button
            onClick={() => setDateFilter(null)}
            className="px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap flex-shrink-0 flex items-center gap-1"
            style={{ backgroundColor: THEME.rejectedBg, color: THEME.rejected }}
          >
            {dateFilter.slice(5).replace("-", "/")} <X size={13} />
          </button>
        )}
      </div>

      {/* 申請一覧 */}
      <div className="space-y-3">
        {grouped.length === 0 && (
          <div className="rounded-2xl p-8 text-center text-sm" style={{ backgroundColor: THEME.surface, color: THEME.inkFaint }}>
            該当する申請はありません
          </div>
        )}
        {grouped.map(([date, list]) => (
          <div key={date} className="rounded-2xl overflow-hidden" style={{ backgroundColor: THEME.surface, boxShadow: "0 1px 2px rgba(28,35,51,0.06)" }}>
            <div className="px-4 py-2 flex items-center justify-between" style={{ backgroundColor: THEME.surfaceAlt }}>
              <span className="text-sm font-bold tabular-nums" style={{ color: THEME.ink, fontFamily: FONT_NUM }}>
                {date} ({WEEK_LABEL[new Date(date).getDay()]})
              </span>
              <span className="text-xs font-semibold" style={{ color: THEME.inkSub }}>
                {list.length}件
              </span>
            </div>
            <div className="divide-y" style={{ borderColor: THEME.border }}>
              {list.map((r) => (
                <div key={r.id} className="px-4 py-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate" style={{ color: THEME.ink }}>
                      {r.name}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: THEME.inkFaint }}>
                      申請: {new Date(r.createdAt).toLocaleDateString("ja-JP")}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => updateStatus(r.id, "approved")}
                      className="w-9 h-9 rounded-full flex items-center justify-center transition active:scale-90"
                      style={
                        r.status === "approved"
                          ? { backgroundColor: THEME.approved, color: "#fff" }
                          : { backgroundColor: THEME.approvedBg, color: THEME.approved }
                      }
                      aria-label="承認"
                    >
                      <Check size={17} />
                    </button>
                    <button
                      onClick={() => updateStatus(r.id, "rejected")}
                      className="w-9 h-9 rounded-full flex items-center justify-center transition active:scale-90"
                      style={
                        r.status === "rejected"
                          ? { backgroundColor: THEME.rejected, color: "#fff" }
                          : { backgroundColor: THEME.rejectedBg, color: THEME.rejected }
                      }
                      aria-label="却下"
                    >
                      <X size={17} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 社員リスト設定 */}
      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: THEME.surface, boxShadow: "0 1px 2px rgba(28,35,51,0.06)" }}>
        <button
          onClick={() => setShowSettings((s) => !s)}
          className="w-full px-4 py-3 flex items-center justify-between text-sm font-semibold"
          style={{ color: THEME.ink }}
        >
          <span className="flex items-center gap-1.5">
            <Settings size={15} /> 社員リストの管理（{employees.length}名）
          </span>
          <ChevronRight size={16} style={{ transform: showSettings ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
        </button>
        {showSettings && (
          <div className="px-4 pb-4 space-y-3">
            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-2 rounded-xl" style={{ backgroundColor: THEME.surfaceAlt }}>
              {employees.map((e) => (
                <span
                  key={e}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                  style={{ backgroundColor: THEME.surface, color: THEME.ink, border: `1px solid ${THEME.border}` }}
                >
                  {e}
                  <button onClick={() => removeName(e)} aria-label={`${e}を削除`}>
                    <X size={12} style={{ color: THEME.inkFaint }} />
                  </button>
                </span>
              ))}
            </div>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder="改行またはカンマ区切りで名前を入力（例: 山田 太郎）"
              rows={3}
              className="w-full rounded-xl px-3 py-2 text-sm outline-none border resize-none"
              style={{ borderColor: THEME.border, color: THEME.ink }}
            />
            <button
              onClick={addNames}
              className="w-full py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-1.5 active:scale-[0.98] transition"
              style={{ backgroundColor: THEME.primarySoft, color: THEME.primary }}
            >
              <Plus size={15} /> 追加
            </button>

            <div className="pt-3 mt-1 border-t" style={{ borderColor: THEME.border }}>
              <div className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: THEME.inkSub }}>
                <KeyRound size={13} /> 管理者PINコードの変更
              </div>
              <div className="flex gap-2">
                <input
                  type="password"
                  inputMode="numeric"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  placeholder="新しいPIN（4〜8桁）"
                  className="flex-1 min-w-0 rounded-xl px-3 py-2 text-sm outline-none border"
                  style={{ borderColor: THEME.border, color: THEME.ink }}
                />
                <button
                  onClick={changePin}
                  disabled={!newPin}
                  className="px-4 py-2 rounded-xl font-semibold text-sm flex-shrink-0 active:scale-95 transition disabled:opacity-40"
                  style={{ backgroundColor: THEME.primarySoft, color: THEME.primary }}
                >
                  変更
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="text-center text-xs pt-2" style={{ color: THEME.inkFaint }}>
        ※ このアプリのデータはFirebaseに保存され、利用者全員で共有されます
      </p>
    </div>
  );
}

/* ---------------------------------------------------------
   ルート
--------------------------------------------------------- */
export default function App() {
  const [role, setRole] = useState("employee");
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [requests, setRequests] = useState([]);
  const [adminPin, setAdminPin] = useState(DEFAULT_ADMIN_PIN);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [toast, setToast] = useState({ message: "", tone: "info" });

  const notify = useCallback((message, tone = "info") => {
    setToast({ message, tone });
    window.clearTimeout(notify._t);
    notify._t = window.setTimeout(() => setToast({ message: "", tone: "info" }), 2600);
  }, []);

  // 初期データが無ければ作成する
  useEffect(() => {
    (async () => {
      const empSnap = await getDoc(employeesRef);
      if (!empSnap.exists()) await setDoc(employeesRef, { list: DEFAULT_EMPLOYEES });

      const reqSnap = await getDoc(requestsRef);
      if (!reqSnap.exists()) await setDoc(requestsRef, { list: [] });

      const setSnap = await getDoc(settingsRef);
      if (!setSnap.exists()) await setDoc(settingsRef, { adminPin: DEFAULT_ADMIN_PIN });
    })().catch(() => {
      notify("Firebaseへの接続に失敗しました。設定(src/firebase.js)をご確認ください", "error");
    });
  }, [notify]);

  // リアルタイム購読（他の人の操作も即座に画面へ反映される）
  useEffect(() => {
    const unsubEmp = onSnapshot(employeesRef, (snap) => {
      if (snap.exists()) setEmployees(snap.data().list || []);
      setLoading(false);
    });
    const unsubReq = onSnapshot(requestsRef, (snap) => {
      if (snap.exists()) setRequests(snap.data().list || []);
    });
    const unsubSet = onSnapshot(settingsRef, (snap) => {
      if (snap.exists()) setAdminPin(snap.data().adminPin || DEFAULT_ADMIN_PIN);
    });
    return () => {
      unsubEmp();
      unsubReq();
      unsubSet();
    };
  }, []);

  const saveEmployees = async (next) => {
    try {
      await setDoc(employeesRef, { list: next });
      return true;
    } catch (e) {
      return false;
    }
  };

  const saveRequests = async (next) => {
    try {
      await setDoc(requestsRef, { list: next });
      return true;
    } catch (e) {
      return false;
    }
  };

  const saveAdminPin = async (next) => {
    try {
      await setDoc(settingsRef, { adminPin: next });
      return true;
    } catch (e) {
      return false;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: THEME.bg, fontFamily: FONT_BODY }}>
        <Loader2 className="animate-spin" size={28} style={{ color: THEME.primary }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: THEME.bg, fontFamily: FONT_BODY }}>
      <Toast message={toast.message} tone={toast.tone} onClose={() => setToast({ message: "", tone: "info" })} />

      {/* ヘッダー */}
      <header className="sticky top-0 z-20 px-4 pt-4 pb-3" style={{ backgroundColor: THEME.bg }}>
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-2 mb-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: THEME.primary, color: "#fff" }}
            >
              <CalendarDays size={17} />
            </div>
            <h1 className="font-bold" style={{ fontSize: 17, color: THEME.ink }}>
              希望休申請
            </h1>
          </div>
          <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl" style={{ backgroundColor: THEME.surfaceAlt }}>
            {[
              { key: "employee", label: "社員" },
              { key: "admin", label: "管理者" },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setRole(t.key)}
                className="py-2 rounded-xl text-sm font-bold transition"
                style={
                  role === t.key
                    ? { backgroundColor: THEME.surface, color: THEME.primary, boxShadow: "0 1px 3px rgba(28,35,51,0.12)" }
                    : { color: THEME.inkSub }
                }
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {role === "employee" ? (
        <EmployeeView employees={employees} requests={requests} saveRequests={saveRequests} notify={notify} />
      ) : adminUnlocked ? (
        <AdminView
          employees={employees}
          saveEmployees={saveEmployees}
          requests={requests}
          saveRequests={saveRequests}
          adminPin={adminPin}
          saveAdminPin={saveAdminPin}
          notify={notify}
        />
      ) : (
        <AdminLock correctPin={adminPin} onUnlock={() => setAdminUnlocked(true)} />
      )}
    </div>
  );
}
