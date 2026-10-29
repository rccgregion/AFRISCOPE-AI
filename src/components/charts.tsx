import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import { useState } from 'react';
import { Table, Notice } from './ui';
export function TimeChart({
  data,
  unit = 'Units',
  forecast = false,
  height = 270,
}: {
  data: Record<string, unknown>[];
  unit?: string;
  forecast?: boolean;
  height?: number;
}) {
  const [accessible, setAccessible] = useState(false);
  return (
    <div className="chart-block">
      <div className="chart-meta">
        <span>{unit}</span>
        <button className="text-button" onClick={() => setAccessible(!accessible)}>
          {accessible ? 'Show chart' : 'Accessible data table'}
        </button>
      </div>
      {accessible ? (
        <Table
          label="Chart data"
          rows={data}
          columns={Object.keys(data[0] || { date: '' }).map((k) => ({ key: k, label: k }))}
        />
      ) : (
        <div style={{ height }} aria-label={`${unit} over time. Synthetic demonstration data.`}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 12, right: 20, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e6e9e5" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#6b7772' }}
                tickLine={false}
                axisLine={false}
                minTickGap={35}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#6b7772' }}
                tickLine={false}
                axisLine={false}
                width={52}
              />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: '1px solid #dfe5df', fontSize: 12 }}
              />
              <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
              {forecast && (
                <Area
                  dataKey="upper"
                  name="Upper sensitivity bound"
                  stroke="none"
                  fill="#dce9df"
                  fillOpacity={0.65}
                  connectNulls
                />
              )}
              {forecast && (
                <Area
                  dataKey="lower"
                  name="Lower sensitivity bound"
                  stroke="none"
                  fill="#ffffff"
                  fillOpacity={1}
                  connectNulls
                />
              )}
              {Object.keys(data[0] || {})
                .filter((k) => !['date', 'upper', 'lower'].includes(k))
                .map((k, i) => (
                  <Line
                    key={k}
                    type="monotone"
                    dataKey={k}
                    name={
                      k === 'actual'
                        ? 'Observed consumption'
                        : k === 'predicted'
                          ? 'Forecast / held-out estimate'
                          : k
                    }
                    stroke={['#23634e', '#bb8a37', '#507fa3'][i % 3]}
                    strokeWidth={2.3}
                    dot={false}
                    connectNulls
                  />
                ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="chart-source">
        Source: validated project records · synthetic demonstration · dates in UTC
      </p>
    </div>
  );
}
export function ComparisonChart({
  data,
  unit = 'People reached (assumed)',
  currency = false,
}: {
  data: { name: string; value: number }[];
  unit?: string;
  currency?: boolean;
}) {
  return (
    <div className="chart-block">
      <div className="chart-meta">
        <span>{unit}</span>
        <span>Zero-baseline comparison</span>
      </div>
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 15, right: 15, bottom: 15, left: 10 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 5" stroke="#e6e9e5" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: '#6b7772' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis tick={{ fontSize: 11, fill: '#6b7772' }} axisLine={false} tickLine={false} />
            <Tooltip
              formatter={(v) =>
                currency
                  ? new Intl.NumberFormat('en', {
                      style: 'currency',
                      currency: 'USD',
                      maximumFractionDigits: 0,
                    }).format(Number(v))
                  : Number(v).toLocaleString()
              }
            />
            <Bar dataKey="value" name={unit} radius={[4, 4, 0, 0]} maxBarSize={64}>
              {data.map((d, i) => (
                <Cell key={d.name} fill={['#23634e', '#8caa91', '#bdcdb4', '#b99557'][i % 4]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="chart-data">
        <summary>Inspect chart values</summary>
        {data.map((d) => (
          <div key={d.name}>
            <span>{d.name}</span>
            <strong>{d.value.toLocaleString()}</strong>
          </div>
        ))}
      </details>
      <p className="chart-source">
        Source: scenario snapshots · synthetic planning assumptions, not measured health impact
      </p>
    </div>
  );
}
export function ChartEmpty() {
  return (
    <Notice>
      Run an analysis to populate this chart. No illustrative values are displayed as results.
    </Notice>
  );
}
