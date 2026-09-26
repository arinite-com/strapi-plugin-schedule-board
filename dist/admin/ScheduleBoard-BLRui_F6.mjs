import { jsxs, jsx } from "react/jsx-runtime";
import { Box, Flex, Typography, Button, EmptyStateLayout, Table, Thead, Tr, Th, Tbody, Td, IconButton, Modal, Field, DateTimePicker, Alert, Tabs } from "@strapi/design-system";
import { Calendar, Pencil, Trash, ArrowClockwise } from "@strapi/icons";
import { useFetchClient, Page, Layouts } from "@strapi/strapi/admin";
import * as React from "react";
import { B as BOARD_PERMISSIONS } from "./index-DaheGKqp.mjs";
const jobIntent = (row) => {
  if (row.outcome === "none") return "No change";
  return row.outcome === "unpublish" ? "Will unpublish" : "Will publish";
};
const noChangeReason = (row) => row.mode === "unpublish" ? "This entry is not live, so there is nothing to take down. The job will run and change nothing." : "This entry is already live and has not been edited since, so there is nothing to publish. The job will run and change nothing.";
const entryState = (row) => row.live ? "Live" : "Draft";
function useQueue() {
  const { get, del, put } = useFetchClient();
  const [rows, setRows] = React.useState([]);
  const [defaultLocale, setDefaultLocale] = React.useState(null);
  const [status, setStatus] = React.useState("loading");
  const load = React.useCallback(async () => {
    try {
      const { data } = await get("/schedule-board/queue");
      setRows(data.data ?? []);
      setDefaultLocale(data.defaultLocale ?? null);
      setStatus(data.available === false ? "unavailable" : "ready");
    } catch {
      setStatus("error");
    }
  }, [get]);
  React.useEffect(() => {
    load();
  }, [load]);
  const cancel = React.useCallback(
    async (documentId) => {
      await del(`/schedule-board/queue/${documentId}`);
      await load();
    },
    [del, load]
  );
  const reschedule = React.useCallback(
    async (documentId, executeAt) => {
      await put(`/schedule-board/queue/${documentId}`, { executeAt: executeAt.toISOString() });
      await load();
    },
    [put, load]
  );
  return { rows, defaultLocale, status, reload: load, cancel, reschedule };
}
const showsLocale = (row, defaultLocale) => Boolean(row.locale) && row.locale !== defaultLocale;
function whenFromNow(iso) {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 6e4);
  if (minutes < 0) return "due now";
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  return `in ${Math.round(hours / 24)} days`;
}
const dayKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
function dayHeading(iso) {
  const date = new Date(iso);
  const today = /* @__PURE__ */ new Date();
  const tomorrow = /* @__PURE__ */ new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (dayKey(date) === dayKey(today)) return "Today";
  if (dayKey(date) === dayKey(tomorrow)) return "Tomorrow";
  return date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}
function groupByDay(rows) {
  const groups = [];
  for (const row of rows) {
    const key = dayKey(new Date(row.executeAt));
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.rows.push(row);
    else groups.push({ key, heading: dayHeading(row.executeAt), rows: [row] });
  }
  return groups;
}
const entryUrl = (row) => {
  const path = `/admin/content-manager/collection-types/${row.entitySlug}/${row.entityId}`;
  return row.locale ? `${path}?plugins[i18n][locale]=${encodeURIComponent(row.locale)}` : path;
};
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function daysOfMonth(month) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - (first.getDay() + 6) % 7);
  const days = [];
  const cursor = new Date(start);
  while (days.length < 42) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
    if (days.length % 7 === 0 && cursor.getMonth() !== month.getMonth() && cursor > first) break;
  }
  return days;
}
const timeOf$1 = (iso) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const CELL_BACKGROUND = { publish: "success100", unpublish: "warning100", none: "neutral150" };
const CELL_TEXT = { publish: "success700", unpublish: "warning700", none: "neutral600" };
function MonthGrid({
  rows,
  defaultLocale,
  onSelect
}) {
  const [month, setMonth] = React.useState(() => /* @__PURE__ */ new Date());
  const byDay = React.useMemo(() => {
    const map = /* @__PURE__ */ new Map();
    for (const row of rows) {
      const key = dayKey(new Date(row.executeAt));
      map.set(key, [...map.get(key) ?? [], row]);
    }
    return map;
  }, [rows]);
  const days = daysOfMonth(month);
  const today = dayKey(/* @__PURE__ */ new Date());
  const step = (by) => setMonth(new Date(month.getFullYear(), month.getMonth() + by, 1));
  const countThisMonth = days.filter((day) => day.getMonth() === month.getMonth()).reduce((total, day) => total + (byDay.get(dayKey(day))?.length ?? 0), 0);
  return /* @__PURE__ */ jsxs(Box, { background: "neutral0", hasRadius: true, padding: 6, shadow: "tableShadow", children: [
    /* @__PURE__ */ jsxs(Flex, { justifyContent: "space-between", alignItems: "center", paddingBottom: 5, children: [
      /* @__PURE__ */ jsxs(Flex, { gap: 3, alignItems: "baseline", children: [
        /* @__PURE__ */ jsx(Typography, { variant: "delta", children: month.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) }),
        /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral500", children: countThisMonth === 0 ? "nothing scheduled" : countThisMonth === 1 ? "1 job" : `${countThisMonth} jobs` })
      ] }),
      /* @__PURE__ */ jsxs(Flex, { gap: 2, children: [
        /* @__PURE__ */ jsx(Button, { variant: "tertiary", onClick: () => step(-1), children: "Previous" }),
        /* @__PURE__ */ jsx(Button, { variant: "tertiary", onClick: () => setMonth(/* @__PURE__ */ new Date()), children: "Today" }),
        /* @__PURE__ */ jsx(Button, { variant: "tertiary", onClick: () => step(1), children: "Next" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs(Box, { style: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "6px" }, children: [
      DAY_NAMES.map((name) => /* @__PURE__ */ jsx(Box, { paddingBottom: 2, children: /* @__PURE__ */ jsx(Typography, { variant: "sigma", textColor: "neutral500", children: name }) }, name)),
      days.map((day) => {
        const key = dayKey(day);
        const entries = byDay.get(key) ?? [];
        const inMonth = day.getMonth() === month.getMonth();
        const isToday = key === today;
        return /* @__PURE__ */ jsxs(
          Box,
          {
            padding: 2,
            hasRadius: true,
            background: isToday ? "primary100" : entries.length > 0 ? "neutral0" : "neutral100",
            borderColor: isToday ? "primary200" : "neutral150",
            borderWidth: "1px",
            borderStyle: "solid",
            style: { minHeight: entries.length > 0 ? "76px" : "44px", opacity: inMonth ? 1 : 0.45 },
            children: [
              /* @__PURE__ */ jsx(
                Typography,
                {
                  variant: "pi",
                  fontWeight: isToday ? "bold" : void 0,
                  textColor: isToday ? "primary600" : "neutral600",
                  children: day.getDate()
                }
              ),
              /* @__PURE__ */ jsx(Flex, { direction: "column", alignItems: "stretch", gap: 1, paddingTop: 1, children: entries.map((row) => /* @__PURE__ */ jsx(
                Box,
                {
                  tag: "button",
                  onClick: () => onSelect(row),
                  paddingLeft: 2,
                  paddingRight: 2,
                  paddingTop: 1,
                  paddingBottom: 1,
                  hasRadius: true,
                  background: CELL_BACKGROUND[row.outcome],
                  title: `${timeOf$1(row.executeAt)} ${row.label}${showsLocale(row, defaultLocale) ? ` (${row.locale})` : ""}. ${entryState(row)}, ${jobIntent(row).toLowerCase()}. Click to reschedule.`,
                  style: { border: "none", cursor: "pointer", textAlign: "left", width: "100%" },
                  children: /* @__PURE__ */ jsxs(Typography, { variant: "pi", textColor: CELL_TEXT[row.outcome], ellipsis: true, children: [
                    timeOf$1(row.executeAt),
                    " ",
                    row.label
                  ] })
                },
                row.documentId
              )) })
            ]
          },
          key
        );
      })
    ] })
  ] });
}
const timeOf = (iso) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const DOT_COLOUR = { publish: "success500", unpublish: "warning500", none: "neutral400" };
function Intent({ row }) {
  const doesNothing = row.outcome === "none";
  return /* @__PURE__ */ jsxs(Flex, { gap: 2, alignItems: "center", title: doesNothing ? noChangeReason(row) : void 0, children: [
    /* @__PURE__ */ jsx(Box, { "aria-hidden": true, style: { width: 6, height: 6, borderRadius: 999 }, background: DOT_COLOUR[row.outcome] }),
    /* @__PURE__ */ jsxs(Typography, { variant: "pi", textColor: doesNothing ? "neutral500" : "neutral700", children: [
      entryState(row),
      ", ",
      jobIntent(row).toLowerCase()
    ] })
  ] });
}
function QueueTable({
  rows,
  defaultLocale,
  onCancel,
  onEdit
}) {
  if (rows.length === 0) {
    return /* @__PURE__ */ jsx(Box, { background: "neutral0", hasRadius: true, padding: 8, shadow: "tableShadow", children: /* @__PURE__ */ jsx(
      EmptyStateLayout,
      {
        icon: /* @__PURE__ */ jsx(Calendar, { width: "10rem" }),
        content: "Nothing is scheduled. Open any entry, set a publish date, and it will wait here until it goes out.",
        action: /* @__PURE__ */ jsx(Button, { variant: "secondary", tag: "a", href: "/admin/content-manager", children: "Go to Content Manager" })
      }
    ) });
  }
  const groups = groupByDay(rows);
  return /* @__PURE__ */ jsxs(Table, { colCount: 4, rowCount: rows.length + groups.length, children: [
    /* @__PURE__ */ jsx(Thead, { children: /* @__PURE__ */ jsxs(Tr, { children: [
      /* @__PURE__ */ jsx(Th, { children: /* @__PURE__ */ jsx(Typography, { variant: "sigma", children: "When" }) }),
      /* @__PURE__ */ jsx(Th, { children: /* @__PURE__ */ jsx(Typography, { variant: "sigma", children: "What" }) }),
      /* @__PURE__ */ jsx(Th, { children: /* @__PURE__ */ jsx(Typography, { variant: "sigma", children: "Outcome" }) }),
      /* @__PURE__ */ jsx(Th, { children: /* @__PURE__ */ jsx(Typography, { variant: "sigma", children: "Actions" }) })
    ] }) }),
    /* @__PURE__ */ jsx(Tbody, { children: groups.map((group) => /* @__PURE__ */ jsxs(React.Fragment, { children: [
      /* @__PURE__ */ jsx(Tr, { children: /* @__PURE__ */ jsx(Td, { colSpan: 4, children: /* @__PURE__ */ jsxs(Flex, { gap: 2, alignItems: "baseline", paddingTop: 2, paddingBottom: 1, children: [
        /* @__PURE__ */ jsx(Typography, { variant: "sigma", textColor: "neutral600", children: group.heading }),
        /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral500", children: group.rows.length === 1 ? "1 job" : `${group.rows.length} jobs` })
      ] }) }) }),
      group.rows.map((row) => /* @__PURE__ */ jsxs(Tr, { children: [
        /* @__PURE__ */ jsx(Td, { children: /* @__PURE__ */ jsxs(Flex, { direction: "column", alignItems: "flex-start", children: [
          /* @__PURE__ */ jsx(Typography, { variant: "omega", fontWeight: "bold", children: timeOf(row.executeAt) }),
          /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral500", children: whenFromNow(row.executeAt) })
        ] }) }),
        /* @__PURE__ */ jsx(Td, { children: /* @__PURE__ */ jsxs(Flex, { direction: "column", alignItems: "flex-start", children: [
          /* @__PURE__ */ jsx(Typography, { variant: "omega", fontWeight: "semiBold", tag: "a", href: entryUrl(row), textColor: "primary600", children: row.label }),
          /* @__PURE__ */ jsxs(Typography, { variant: "pi", textColor: "neutral500", children: [
            row.contentType,
            showsLocale(row, defaultLocale) ? ` · ${row.locale}` : ""
          ] })
        ] }) }),
        /* @__PURE__ */ jsx(Td, { children: /* @__PURE__ */ jsx(Intent, { row }) }),
        /* @__PURE__ */ jsx(Td, { children: /* @__PURE__ */ jsxs(Flex, { gap: 1, justifyContent: "flex-end", children: [
          /* @__PURE__ */ jsx(IconButton, { label: "Reschedule", onClick: () => onEdit(row), children: /* @__PURE__ */ jsx(Pencil, {}) }),
          /* @__PURE__ */ jsx(IconButton, { label: "Cancel this job", variant: "danger-light", onClick: () => onCancel(row.documentId), children: /* @__PURE__ */ jsx(Trash, {}) })
        ] }) })
      ] }, row.documentId))
    ] }, group.key)) })
  ] });
}
function RescheduleDialog({
  row,
  onClose,
  onSave
}) {
  const [when, setWhen] = React.useState();
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => {
    setWhen(row ? new Date(row.executeAt) : void 0);
  }, [row]);
  const inPast = when ? when.getTime() < Date.now() : false;
  const save = async () => {
    if (!row || !when) return;
    setSaving(true);
    try {
      await onSave(row.documentId, when);
      onClose();
    } finally {
      setSaving(false);
    }
  };
  return /* @__PURE__ */ jsx(Modal.Root, { open: Boolean(row), onOpenChange: (open) => open ? void 0 : onClose(), children: /* @__PURE__ */ jsxs(Modal.Content, { children: [
    /* @__PURE__ */ jsx(Modal.Header, { children: /* @__PURE__ */ jsx(Modal.Title, { children: "Reschedule" }) }),
    /* @__PURE__ */ jsx(Modal.Body, { children: /* @__PURE__ */ jsxs(Flex, { direction: "column", alignItems: "stretch", gap: 3, children: [
      /* @__PURE__ */ jsx(Typography, { textColor: "neutral600", children: row?.label }),
      /* @__PURE__ */ jsxs(Field.Root, { name: "executeAt", error: inPast ? "Pick a time in the future." : void 0, children: [
        /* @__PURE__ */ jsx(Field.Label, { children: row?.mode === "unpublish" ? "Unpublish at" : "Publish at" }),
        /* @__PURE__ */ jsx(DateTimePicker, { value: when, onChange: setWhen }),
        /* @__PURE__ */ jsx(Field.Error, {})
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs(Modal.Footer, { children: [
      /* @__PURE__ */ jsx(Modal.Close, { children: /* @__PURE__ */ jsx(Button, { variant: "tertiary", children: "Cancel" }) }),
      /* @__PURE__ */ jsx(Button, { onClick: save, loading: saving, disabled: !when || inPast, children: "Save" })
    ] })
  ] }) });
}
function ScheduleBoardPage() {
  return /* @__PURE__ */ jsx(Page.Protect, { permissions: BOARD_PERMISSIONS, children: /* @__PURE__ */ jsx(Board, {}) });
}
function Board() {
  const { rows, defaultLocale, status, cancel, reschedule, reload } = useQueue();
  const [editing, setEditing] = React.useState(null);
  if (status === "loading") return /* @__PURE__ */ jsx(Page.Loading, {});
  if (status === "error") return /* @__PURE__ */ jsx(Page.Error, {});
  if (status === "unavailable") {
    return /* @__PURE__ */ jsxs(Layouts.Root, { children: [
      /* @__PURE__ */ jsx(Page.Title, { children: "Schedule" }),
      /* @__PURE__ */ jsx(Layouts.Header, { title: "Schedule", subtitle: "Scheduling is switched off" }),
      /* @__PURE__ */ jsx(Layouts.Content, { children: /* @__PURE__ */ jsx(Alert, { title: "The publisher plugin is not enabled", variant: "default", closeLabel: "Close", children: "Scheduled publishing comes from strapi-plugin-publisher. Enable it in config/plugins.ts and restart, and everything waiting to go out will appear here." }) })
    ] });
  }
  const next = rows[0];
  const subtitle = next ? `${rows.length === 1 ? "1 job" : `${rows.length} jobs`} waiting, next is "${next.label}"` : "Nothing waiting to go out";
  return /* @__PURE__ */ jsxs(Layouts.Root, { children: [
    /* @__PURE__ */ jsx(Page.Title, { children: "Schedule" }),
    /* @__PURE__ */ jsx(
      Layouts.Header,
      {
        title: "Schedule",
        subtitle,
        primaryAction: /* @__PURE__ */ jsx(Button, { variant: "tertiary", startIcon: /* @__PURE__ */ jsx(ArrowClockwise, {}), onClick: reload, children: "Refresh" })
      }
    ),
    /* @__PURE__ */ jsx(Layouts.Content, { children: /* @__PURE__ */ jsxs(Tabs.Root, { defaultValue: "queue", children: [
      /* @__PURE__ */ jsxs(Tabs.List, { "aria-label": "Queue or calendar", children: [
        /* @__PURE__ */ jsx(Tabs.Trigger, { value: "queue", children: "Queue" }),
        /* @__PURE__ */ jsx(Tabs.Trigger, { value: "calendar", children: "Calendar" })
      ] }),
      /* @__PURE__ */ jsx(Tabs.Content, { value: "queue", children: /* @__PURE__ */ jsx(QueueTable, { rows, defaultLocale, onCancel: cancel, onEdit: setEditing }) }),
      /* @__PURE__ */ jsx(Tabs.Content, { value: "calendar", children: /* @__PURE__ */ jsx(Box, { paddingTop: 4, children: /* @__PURE__ */ jsx(MonthGrid, { rows, defaultLocale, onSelect: setEditing }) }) })
    ] }) }),
    /* @__PURE__ */ jsx(RescheduleDialog, { row: editing, onClose: () => setEditing(null), onSave: reschedule })
  ] });
}
export {
  ScheduleBoardPage as default
};
