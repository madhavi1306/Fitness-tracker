import {
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { displayWeight } from '../utils/units.js';

const muscleColors = ['#b7ee66', '#8dc75a', '#65a982', '#5b9eaa', '#7d83bd', '#b48fbe'];
const chartTooltip = {
  contentStyle: { border: '1px solid #394137', borderRadius: 3, color: '#eef0ea', background: '#171a17', fontSize: 11 },
  itemStyle: { color: '#b7ee66' },
  labelStyle: { color: '#92968f', marginBottom: 4 },
};

function axisWeight(value) {
  return Math.round(value);
}

export function WeeklyVolumeChart({ data = [], unit }) {
  const chartData = data.map((item) => ({ ...item, label: item.day.slice(0, 3), volume: displayWeight(item.volumeKg, unit) }));
  return <div className="progress-chart">
    {chartData.some((item) => item.volume > 0) ? <ResponsiveContainer width="100%" height={220}>
      <LineChart data={chartData} margin={{ top: 10, right: 12, bottom: 0, left: -12 }}>
        <XAxis dataKey="label" tick={{ fill: '#92968f', fontSize: 10 }} axisLine={{ stroke: '#343a32' }} tickLine={false} />
        <YAxis tickFormatter={(value) => axisWeight(value, unit)} tick={{ fill: '#777f75', fontSize: 9 }} axisLine={false} tickLine={false} />
        <Tooltip {...chartTooltip} formatter={(value) => [`${Number(value).toFixed(1)} ${unit}·reps`, 'Volume']} />
        <Line type="monotone" dataKey="volume" stroke="#b7ee66" strokeWidth={2.5} dot={{ r: 3, fill: '#b7ee66', stroke: '#151815', strokeWidth: 2 }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer> : <div className="chart-no-data">Complete a workout to see volume by weekday.</div>}
  </div>;
}

export function StrengthChart({ data = [], unit, compact = false }) {
  const chartData = [...data].sort((a, b) => new Date(a.date) - new Date(b.date)).map((item) => ({
    ...item,
    label: new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    estimated: displayWeight(item.estimatedOneRepMaxKg, unit),
  }));
  return <div className="progress-chart">
    {chartData.length ? <ResponsiveContainer width="100%" height={compact ? 200 : 270}>
      <LineChart data={chartData} margin={{ top: 10, right: 12, bottom: 0, left: -12 }}>
        <XAxis dataKey="label" tick={{ fill: '#92968f', fontSize: 9 }} axisLine={{ stroke: '#343a32' }} tickLine={false} />
        <YAxis tickFormatter={(value) => axisWeight(value, unit)} tick={{ fill: '#777f75', fontSize: 9 }} axisLine={false} tickLine={false} />
        <Tooltip {...chartTooltip} formatter={(value) => [`${Number(value).toFixed(1)} ${unit}`, 'Estimated 1RM']} />
        <Line type="monotone" dataKey="estimated" stroke="#b7ee66" strokeWidth={2.5} dot={{ r: 3, fill: '#b7ee66', stroke: '#151815', strokeWidth: 2 }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer> : <div className="chart-no-data">Log a weighted set to start your strength chart.</div>}
  </div>;
}

export function MuscleSplitChart({ data = [], unit }) {
  const chartData = data.map((item) => ({ name: item.muscleGroup, value: displayWeight(item.volumeKg, unit) })).filter((item) => item.value > 0);
  return <div className="muscle-chart-layout">
    {chartData.length ? <>
      <ResponsiveContainer width="52%" height={205}>
        <PieChart><Pie data={chartData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={3} stroke="#151815">
          {chartData.map((item, index) => <Cell key={item.name} fill={muscleColors[index % muscleColors.length]} />)}
        </Pie><Tooltip {...chartTooltip} formatter={(value) => [`${Number(value).toFixed(1)} ${unit}·reps`, 'Volume']} /></PieChart>
      </ResponsiveContainer>
      <ul className="muscle-legend">{chartData.map((item, index) => <li key={item.name}><span style={{ backgroundColor: muscleColors[index % muscleColors.length] }} /><span>{item.name}</span><strong>{item.value.toFixed(0)}</strong></li>)}</ul>
    </> : <div className="chart-no-data">Muscle group volume appears after completed workouts.</div>}
  </div>;
}

export function BodyWeightChart({ data = [], unit }) {
  const chartData = data.map((item) => ({
    ...item,
    label: new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    weight: displayWeight(item.weightKg, unit),
  }));
  return <div className="progress-chart">
    {chartData.length ? <ResponsiveContainer width="100%" height={230}>
      <LineChart data={chartData} margin={{ top: 10, right: 12, bottom: 0, left: -12 }}>
        <XAxis dataKey="label" tick={{ fill: '#92968f', fontSize: 9 }} axisLine={{ stroke: '#343a32' }} tickLine={false} />
        <YAxis domain={['dataMin - 1', 'dataMax + 1']} tickFormatter={(value) => Number(value).toFixed(0)} tick={{ fill: '#777f75', fontSize: 9 }} axisLine={false} tickLine={false} />
        <Tooltip {...chartTooltip} formatter={(value) => [`${Number(value).toFixed(1)} ${unit}`, 'Body weight']} />
        <Line type="monotone" dataKey="weight" stroke="#80c7b1" strokeWidth={2.5} dot={{ r: 3, fill: '#80c7b1', stroke: '#151815', strokeWidth: 2 }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer> : <div className="chart-no-data">Add your first body-weight measurement to see the trend.</div>}
  </div>;
}
