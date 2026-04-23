"use client";

import React, { useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  ColumnDef,
} from "@tanstack/react-table";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MinusCircle,
  PauseCircle,
  Timer,
  XCircle,
} from "lucide-react";
import useTaskStore from "@/stores/useTaskStore";
import type { RunStepSnapshot } from "@/lib/workspace-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function formatElapsed(startedAt: string | null, finishedAt: string | null) {
  if (!startedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const ms = Math.max(end - start, 0);
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function renderStatus(step: RunStepSnapshot) {
  switch (step.status) {
    case "pass":
      return {
        label: "Pass",
        icon: CheckCircle2,
        className: "text-emerald-600",
      };
    case "fail":
      return {
        label: "Fail",
        icon: XCircle,
        className: "text-rose-600",
      };
    case "running":
      return {
        label: "Running",
        icon: Loader2,
        className: "text-slate-600 animate-spin",
      };
    case "blocked":
      return {
        label: "Blocked",
        icon: AlertTriangle,
        className: "text-amber-600",
      };
    case "not_run":
      return {
        label: "Not run",
        icon: MinusCircle,
        className: "text-slate-400",
      };
    default:
      return {
        label: "Pending",
        icon: PauseCircle,
        className: "text-slate-400",
      };
  }
}

export default function TestScriptStepsTableWidget() {
  const testCases = useTaskStore((s) => s.testCases);
  const currentRunSnapshot = useTaskStore((s) => s.currentRunSnapshot);

  const totalTimeElapsed = formatElapsed(
    currentRunSnapshot?.startedAt || null,
    currentRunSnapshot?.finishedAt || null
  );

  const columns = useMemo<ColumnDef<RunStepSnapshot>[]>(
    () => [
      {
        accessorKey: "step_number",
        header: "#",
        meta: { style: { width: "8%" } },
      },
      {
        accessorKey: "step_instructions",
        header: "Instructions",
        meta: { style: { width: "47%" } },
      },
      {
        accessorKey: "status",
        header: "Status",
        meta: { style: { width: "15%" } },
        cell: ({ row }) => {
          const descriptor = renderStatus(row.original);
          const Icon = descriptor.icon;
          return (
            <span
              title={row.original.step_reasoning}
              className="inline-flex items-center gap-2"
            >
              <Icon className={descriptor.className} size={18} />
              <span>{descriptor.label}</span>
            </span>
          );
        },
      },
      {
        accessorKey: "step_reasoning",
        header: "Reasoning",
        meta: { style: { width: "20%" } },
        cell: ({ getValue }) => (
          <span className="text-sm text-slate-500 whitespace-normal">
            {getValue<string>() || "No reasoning yet"}
          </span>
        ),
      },
      {
        header: "Image",
        meta: { style: { width: "10%" } },
        cell: ({ row }) => {
          if (!row.original.image_path) {
            return <span className="text-slate-400">No image</span>;
          }
          return (
            <a
              href={row.original.image_path}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-700 underline"
            >
              Open
            </a>
          );
        },
      },
    ],
    []
  );

  const table = useReactTable({
    data: testCases,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">
      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center justify-between gap-4">
            <span>Task Steps</span>
            <span className="flex items-center gap-2 text-sm font-normal text-slate-500">
              <Timer size={16} />
              {totalTimeElapsed || "Waiting to start"}
            </span>
          </CardTitle>
          {currentRunSnapshot?.errorInfo ? (
            <p className="text-sm text-rose-600">{currentRunSnapshot.errorInfo}</p>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full table-fixed divide-y divide-slate-200">
              <thead className="bg-slate-50">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((header) => (
                      <th
                        key={header.id}
                        style={header.column.columnDef.meta?.style}
                        className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500"
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {testCases.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-8 text-sm text-slate-500"
                    >
                      Run steps will appear here once a saved run starts.
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <tr key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          style={cell.column.columnDef.meta?.style}
                          className="px-6 py-4 align-top text-sm text-slate-700 whitespace-normal"
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
