"use client";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";

const fmt = (n: number) => new Intl.NumberFormat("de-AT", { maximumFractionDigits: 0 }).format(n);
const fmtEur = (n: number) => new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

export function MonatsChart({ data, provision }: { data: { label: string; umsatz: number; selbstkosten: number; abgaben: number; db1: number; provision?: number }[]; provision?: boolean }) {
  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid vertical={false} stroke="#ddd9d0" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#6b7477" }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#6b7477" }} tickFormatter={fmt} width={52} />
          <Tooltip formatter={(v) => fmtEur(Number(v))} contentStyle={{ borderRadius: 12, border: "1px solid #ddd9d0", boxShadow: "0 8px 24px -12px rgba(15,27,45,.2)", fontSize: 13 }} cursor={{ fill: "rgba(16,34,42,.05)" }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
          <Bar dataKey="umsatz" name="Verrechnung" fill="#10222a" radius={[2, 2, 0, 0]} maxBarSize={28} />
          {!provision && <Bar dataKey="selbstkosten" name="Bruttolöhne" fill="#b9b3a6" radius={[2, 2, 0, 0]} maxBarSize={28} />}
          {!provision && <Bar dataKey="abgaben" name="Abgaben & Rückstellungen" fill="#e3c9bd" radius={[2, 2, 0, 0]} maxBarSize={28} />}
          <Line type="monotone" dataKey={provision ? "provision" : "db1"} name={provision ? "Provision" : "DB1"} stroke="#b4522c" strokeWidth={2.5} dot={{ r: 3, fill: "#b4522c", strokeWidth: 0 }} activeDot={{ r: 5 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
