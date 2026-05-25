"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const sampleRows = [
  { table: "orders", rows: 18420 },
  { table: "customers", rows: 5231 },
  { table: "products", rows: 714 },
  { table: "refunds", rows: 312 },
];

export function SchemaChart() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={sampleRows}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="table" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} />
        <Tooltip />
        <Bar dataKey="rows" fill="#059669" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
