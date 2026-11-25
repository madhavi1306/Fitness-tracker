import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Apple, ArrowRight, Check, Clock3, Flame, Leaf, Pencil, Plus, Search, Soup, Trash2, Utensils, Weight, Wheat } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useUnits } from '../context/UnitContext.jsx';
import { apiRequest } from '../services/api.js';
import { displayWeight } from '../utils/units.js';
import { localDateString } from '../utils/dates.js';

const charts = import('../components/ProgressCharts.jsx');
const BodyWeightChart = lazy(() => charts.then((module) => ({ default: module.BodyWeightChart })));
const chartFallback = <div className="chart-no-data">Loading weight history...</div>;
const mealTypes = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACKS'];
const mealLabels = { BREAKFAST: 'Breakfast', LUNCH: 'Lunch', DINNER: 'Dinner', SNACKS: 'Snacks' };
const goalLabels = {
  WEIGHT_GAIN: 'Weight gain',
  WEIGHT_LOSS: 'Weight loss',
  MAINTAIN_WEIGHT: 'Maintain weight',
  BUILD_STRENGTH: 'Build strength',
};
const goalDescriptions = {
  WEIGHT_GAIN: 'A modest calorie surplus supports gradual weight gain alongside balanced meals.',
  WEIGHT_LOSS: 'A modest, sustainable calorie reduction is used; avoid crash diets or extreme restriction.',
  MAINTAIN_WEIGHT: 'Targets are centered around an estimated maintenance intake.',
  BUILD_STRENGTH: 'A small calorie allowance and higher protein support strength training.',
};
const artByCategory = {
  Protein: Utensils,
  Grains: Wheat,
  Dairy: Soup,
  Fruit: Apple,
  Vegetables: Leaf,
};

function amount(value, digits = 0) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: digits });
}

function ProgressBar({ label, consumed, target, unit, tone = 'green' }) {
  const percent = target > 0 ? Math.min(100, Math.max(0, consumed / target * 100)) : 0;
  return (
    <div className={`nutrition-progress nutrition-progress-${tone}`}>
      <div className="nutrition-progress-heading"><span>{label}</span><strong>{amount(consumed, 1)} / {amount(target, 1)} {unit}</strong></div>
      <div className="nutrition-progress-track" role="progressbar" aria-label={label} aria-valuenow={Math.round(percent)} aria-valuemin="0" aria-valuemax="100">
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function nutritionSummary(nutrition) {
  return `${amount(nutrition.calories)} kcal · ${amount(nutrition.proteinGrams, 1)} g protein · ${amount(nutrition.carbohydratesGrams, 1)} g carbs · ${amount(nutrition.fatGrams, 1)} g fat`;
}

export default function NutritionPage() {
  const { token } = useAuth();
  const { unit } = useUnits();
  const [date, setDate] = useState(() => localDateString());
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [progress, setProgress] = useState(null);
  const [foods, setFoods] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedFoodId, setSelectedFoodId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [mealType, setMealType] = useState('BREAKFAST');
  const [editingId, setEditingId] = useState('');
  const [editQuantity, setEditQuantity] = useState('');
  const [editMealType, setEditMealType] = useState('BREAKFAST');
  const [showCustomFood, setShowCustomFood] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadData(selectedDate = date) {
    const queryDate = encodeURIComponent(selectedDate);
    const [today, recentHistory, overall] = await Promise.all([
      apiRequest(`/nutrition/today?date=${queryDate}`, { token }),
      apiRequest('/nutrition/history', { token }),
      apiRequest('/progress/overall?range=allTime', { token }),
    ]);
    setData(today);
    setHistory(recentHistory.days);
    setProgress(overall);
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      apiRequest(`/nutrition/today?date=${encodeURIComponent(date)}`, { token }),
      apiRequest('/nutrition/history', { token }),
      apiRequest('/progress/overall?range=allTime', { token }),
    ]).then(([today, recentHistory, overall]) => {
      if (!active) return;
      setData(today);
      setHistory(recentHistory.days);
      setProgress(overall);
      setError('');
    }).catch((requestError) => {
      if (active) setError(requestError.message);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [date, token]);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      apiRequest(`/foods/search?search=${encodeURIComponent(search)}`, { token })
        .then(({ foods: results }) => {
          if (!active) return;
          setFoods(results);
          setSelectedFoodId((current) => results.some((food) => food.id === current) ? current : results[0]?.id || '');
        })
        .catch((requestError) => { if (active) setError(requestError.message); });
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, token]);

  const selectedFood = useMemo(() => foods.find((food) => food.id === selectedFoodId), [foods, selectedFoodId]);
  const logs = data?.logs || [];
  const totals = data?.totals || { calories: 0, proteinGrams: 0, carbohydratesGrams: 0, fatGrams: 0 };
  const target = data?.target;
  const profile = data?.profile;
  const weight = progress?.bodyWeight;
  const latestWorkouts = progress?.recentWorkouts || [];
  const goal = goalLabels[profile?.fitnessGoal] || 'Fitness goal';
  const currentWeightKg = weight?.currentWeightKg ?? profile?.currentWeightKg ?? 0;
  const startingWeightKg = weight?.startingWeightKg ?? profile?.startingWeightKg ?? currentWeightKg;
  const targetWeightKg = weight?.targetWeightKg ?? profile?.targetWeightKg;
  const weightProgress = targetWeightKg == null || targetWeightKg === startingWeightKg
    ? (targetWeightKg != null && currentWeightKg === targetWeightKg ? 100 : 0)
    : Math.max(0, Math.min(100, (currentWeightKg - startingWeightKg) / (targetWeightKg - startingWeightKg) * 100));
  const suggestions = data?.suggestions || [];
  const mealSuggestions = data?.mealSuggestions || [];

  async function refresh() {
    setError('');
    await loadData(date);
    setNotice('');
  }

  async function addEntry(foodId, count, meal) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await apiRequest('/nutrition/food', {
        method: 'POST',
        token,
        body: JSON.stringify({ foodId, quantity: Number(count), mealType: meal, date }),
      });
      await refresh();
      setNotice('Food added to your daily log.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitFood(event) {
    event.preventDefault();
    if (!selectedFoodId) return;
    await addEntry(selectedFoodId, quantity, mealType);
  }

  async function addMeal(meal) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      for (const ingredient of meal.ingredients) {
        await apiRequest('/nutrition/food', {
          method: 'POST',
          token,
          body: JSON.stringify({
            foodId: ingredient.foodId,
            quantity: ingredient.quantity,
            mealType: meal.mealType,
            date,
          }),
        });
      }
      await refresh();
      setNotice(`${meal.name} added to your ${mealLabels[meal.mealType].toLowerCase()} log.`);
    } catch (requestError) {
      setError(requestError.message);
      try {
        await loadData(date);
      } catch (refreshError) {
        setError(`${requestError.message} The log could not be refreshed: ${refreshError.message}`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(event, id) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await apiRequest(`/nutrition/food/${encodeURIComponent(id)}`, {
        method: 'PUT',
        token,
        body: JSON.stringify({ quantity: Number(editQuantity), mealType: editMealType }),
      });
      setEditingId('');
      await refresh();
      setNotice('Food log updated.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteEntry(id) {
    setBusy(true);
    setError('');
    try {
      await apiRequest(`/nutrition/food/${encodeURIComponent(id)}`, { method: 'DELETE', token });
      await refresh();
      setNotice('Food removed from your log.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function createCustomFood(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setError('');
    try {
      const { food } = await apiRequest('/foods', {
        method: 'POST',
        token,
        body: JSON.stringify({
          name: form.get('name'),
          category: form.get('category'),
          servingUnit: form.get('servingUnit'),
          servingSize: Number(form.get('servingSize')),
          calories: Number(form.get('calories')),
          proteinGrams: Number(form.get('proteinGrams')),
          carbohydratesGrams: Number(form.get('carbohydratesGrams')),
          fatGrams: Number(form.get('fatGrams')),
          dietaryTags: Array.from(form.getAll('dietaryTags')),
        }),
      });
      setShowCustomFood(false);
      setSearch(food.name);
      setSelectedFoodId(food.id);
      setNotice("Custom food created. Add it to today's log when ready.");
      formElement.reset();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function recalculateTargets() {
    setBusy(true);
    setError('');
    try {
      await apiRequest('/nutrition/targets', { method: 'POST', token, body: JSON.stringify({}) });
      await refresh();
      setNotice('Nutrition estimates refreshed from your profile.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  const dayCalories = totals.calories;
  const calorieRemaining = target ? target.dailyCalories - dayCalories : 0;
  const proteinRemaining = target ? target.proteinGrams - totals.proteinGrams : 0;
  return (
    <div className="nutrition-page page-enter">
      <section className="workout-page-intro nutrition-intro">
        <div>
          <span className="eyebrow">YOUR FOOD, YOUR GOAL</span>
          <h2>Nutrition, made practical.</h2>
          <p>Track everyday meals and compare them with profile-based estimates.</p>
        </div>
        <div className="nutrition-intro-actions">
          <label className="field-label">Log date<input aria-label="Log date" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <Link className="button button-outline" to="/app/profile"><Pencil size={15} /> Edit goals</Link>
        </div>
      </section>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success" role="status"><Check size={16} />{notice}</p>}
      {loading && !data ? <div className="workout-loading">Loading your nutrition...</div> : (
        <>
          <section className="nutrition-hero-grid" aria-label="Daily nutrition targets">
            <article className="nutrition-hero-card nutrition-calories-card">
              <div className="nutrition-card-top"><span className="nutrition-icon"><Flame size={18} /></span><span className="eyebrow">CALORIES TODAY</span></div>
              <div className="nutrition-primary-number">{amount(dayCalories)} <small>kcal</small></div>
              <p>{amount(Math.abs(calorieRemaining))} kcal {calorieRemaining >= 0 ? 'remaining' : 'over target'}</p>
              <ProgressBar label="Daily calorie target" consumed={dayCalories} target={target?.dailyCalories || 0} unit="kcal" />
            </article>
            <article className="nutrition-hero-card">
              <div className="nutrition-card-top"><span className="nutrition-icon"><Weight size={17} /></span><span className="eyebrow">PROTEIN</span></div>
              <div className="nutrition-primary-number">{amount(totals.proteinGrams, 1)} <small>g</small></div>
              <p>{amount(Math.max(0, proteinRemaining), 1)} g to daily target</p>
              <ProgressBar label="Protein target" consumed={totals.proteinGrams} target={target?.proteinGrams || 0} unit="g" tone="orange" />
            </article>
            <article className="nutrition-macro-card">
              <span className="eyebrow">CARBOHYDRATES</span><strong>{amount(totals.carbohydratesGrams, 1)} <small>/ {amount(target?.carbohydratesGrams, 1)} g</small></strong>
              <ProgressBar label="Carbohydrates target" consumed={totals.carbohydratesGrams} target={target?.carbohydratesGrams || 0} unit="g" tone="purple" />
            </article>
            <article className="nutrition-macro-card">
              <span className="eyebrow">FAT</span><strong>{amount(totals.fatGrams, 1)} <small>/ {amount(target?.fatGrams, 1)} g</small></strong>
              <ProgressBar label="Fat target" consumed={totals.fatGrams} target={target?.fatGrams || 0} unit="g" tone="blue" />
            </article>
          </section>

          <section className="nutrition-estimate-note">
            <span className="nutrition-icon"><Check size={17} /></span>
            <div><strong>Estimated targets · {goal}</strong><p>{target?.estimateDisclaimer || 'Targets are estimates, not medical advice.'} Your activity and profile can change these values.</p></div>
            <button type="button" className="quiet-link nutrition-recalculate" onClick={recalculateTargets} disabled={busy}>Refresh estimate</button>
          </section>
          <section className="nutrition-example-note">
            <strong>Example meal calculation</strong>
            <span>2 eggs + 2 chapatis + 1 bowl of dal ≈ 564 kcal · 29.6 g protein · 62.8 g carbs · 20.6 g fat.</span>
          </section>
          {target?.professionalGuidanceRecommended && <p className="nutrition-safety-note" role="note">For users under 18, involve a qualified health professional before changing food intake or pursuing weight loss.</p>}

          <div className="nutrition-layout">
            <section className="dashboard-section nutrition-log-section">
              <div className="section-heading"><div><span className="eyebrow">FOOD DIARY · {new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}</span><h2>Log a meal</h2></div><Utensils size={18} /></div>
              <form className="nutrition-food-form" onSubmit={submitFood}>
                <label className="field-label nutrition-search-field">Search food
                  <span className="nutrition-search-wrap"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Try eggs, dal, chapati..." /></span>
                </label>
                <label className="field-label">Food<select value={selectedFoodId} onChange={(event) => setSelectedFoodId(event.target.value)} required>
                  {foods.length ? foods.map((food) => <option key={food.id} value={food.id}>{food.name} · {amount(food.calories)} kcal / {food.servingUnit}</option>) : <option value="">No matching foods</option>}
                </select></label>
                <label className="field-label">Quantity ({selectedFood?.servingUnit || 'servings'})<input type="number" min="0.1" max="50" step="0.1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></label>
                <label className="field-label">Meal
                  <select value={mealType} onChange={(event) => setMealType(event.target.value)}>{mealTypes.map((meal) => <option key={meal} value={meal}>{mealLabels[meal]}</option>)}</select>
                </label>
                {selectedFood && <p className="selected-food-nutrition">Per {selectedFood.servingUnit} ({amount(selectedFood.servingSize)} g/ml): {nutritionSummary(selectedFood)}</p>}
                <button className="button nutrition-add-button" type="submit" disabled={busy || !selectedFoodId}><Plus size={16} /> Add food</button>
              </form>

              <div className="nutrition-log-heading"><h3>Food for this day</h3><span>{logs.length} {logs.length === 1 ? 'entry' : 'entries'}</span></div>
              {logs.length ? <div className="nutrition-log-list">
                {logs.map((entry) => {
                  const Art = artByCategory[foods.find((food) => food.id === entry.foodId)?.category] || Utensils;
                  return (
                    <article className="nutrition-log-row" key={entry.id}>
                      <span className="food-art"><Art size={18} /></span>
                      {editingId === entry.id ? (
                        <form className="nutrition-edit-form" onSubmit={(event) => saveEdit(event, entry.id)}>
                          <strong>{entry.foodName}</strong>
                          <input aria-label={`Quantity for ${entry.foodName}`} type="number" min="0.1" max="50" step="0.1" value={editQuantity} onChange={(event) => setEditQuantity(event.target.value)} required />
                          <select aria-label={`Meal for ${entry.foodName}`} value={editMealType} onChange={(event) => setEditMealType(event.target.value)}>{mealTypes.map((meal) => <option key={meal} value={meal}>{mealLabels[meal]}</option>)}</select>
                          <button className="quiet-link" type="submit" disabled={busy}>Save</button>
                          <button className="icon-button" type="button" aria-label="Cancel edit" onClick={() => setEditingId('')}><Trash2 size={14} /></button>
                        </form>
                      ) : (
                        <>
                          <span className="nutrition-log-copy"><strong>{entry.foodName}</strong><small>{amount(entry.quantity, 1)} × {entry.servingUnit} · {mealLabels[entry.mealType]}</small></span>
                          <span className="nutrition-log-macros"><strong>{amount(entry.calories)} kcal</strong><small>{amount(entry.proteinGrams, 1)}P · {amount(entry.carbohydratesGrams, 1)}C · {amount(entry.fatGrams, 1)}F g</small></span>
                          <span className="nutrition-row-actions">
                            <button className="icon-button" type="button" aria-label={`Edit ${entry.foodName}`} onClick={() => { setEditingId(entry.id); setEditQuantity(String(entry.quantity)); setEditMealType(entry.mealType); }}><Pencil size={14} /></button>
                            <button className="icon-button nutrition-delete" type="button" aria-label={`Delete ${entry.foodName}`} onClick={() => deleteEntry(entry.id)} disabled={busy}><Trash2 size={14} /></button>
                          </span>
                        </>
                      )}
                    </article>
                  );
                })}
              </div> : <div className="progress-empty-inline"><Apple size={18} /><span>No food logged for this day yet. Add your first meal above.</span></div>}
            </section>

            <div className="nutrition-side-column">
              <section className="dashboard-section nutrition-suggestion-section">
                <div className="section-heading"><div><span className="eyebrow">SMART PICKS</span><h2>Food suggestions</h2></div><Leaf size={18} /></div>
                <p className="nutrition-section-note">Based on your remaining protein, calories, and {profile?.dietaryPreference?.toLowerCase().replace('_', ' ') || 'food'} preference.</p>
                {suggestions.length ? <div className="nutrition-suggestion-list">{suggestions.map((food) => {
                  const Art = artByCategory[food.category] || Utensils;
                  return <article className="nutrition-suggestion-row" key={food.id}>
                    <span className="food-art"><Art size={16} /></span><span><strong>{food.name}</strong><small>{amount(food.calories)} kcal · {amount(food.proteinGrams, 1)} g protein</small></span>
                    <button className="icon-button" type="button" aria-label={`Add ${food.name} suggestion`} disabled={busy} onClick={() => addEntry(food.id, 1, mealType)}><Plus size={15} /></button>
                  </article>;
                })}</div> : <p className="nutrition-empty-small">Update your food preference or targets to see suitable suggestions.</p>}
                <p className="nutrition-feedback">{proteinRemaining > 1
                  ? `About ${amount(proteinRemaining)} g more protein would meet today's estimate.`
                  : 'You have reached your estimated protein target for today.'}</p>
              </section>

              <section className="dashboard-section nutrition-goal-section">
                <div className="section-heading"><div><span className="eyebrow">YOUR FITNESS GOAL</span><h2>{goal}</h2></div><Weight size={18} /></div>
                <div className="nutrition-weight-summary">
                  <span><small>Current</small><strong>{displayWeight(currentWeightKg, unit).toFixed(1)} {unit}</strong></span>
                  <span><small>Target</small><strong>{targetWeightKg == null ? 'Set in profile' : `${displayWeight(targetWeightKg, unit).toFixed(1)} ${unit}`}</strong></span>
                  <span><small>Change since start</small><strong>{displayWeight(currentWeightKg - startingWeightKg, unit).toFixed(1)} {unit}</strong></span>
                </div>
                <p className="nutrition-section-note">{goalDescriptions[profile?.fitnessGoal]}</p>
                {targetWeightKg != null ? <div className="nutrition-progress nutrition-goal-progress">
                  <div className="nutrition-progress-heading"><span>Goal progress</span><strong>{amount(weightProgress)}%</strong></div>
                  <div className="nutrition-progress-track" role="progressbar" aria-label="Weight goal progress" aria-valuenow={Math.round(weightProgress)} aria-valuemin="0" aria-valuemax="100"><span style={{ width: `${weightProgress}%` }} /></div>
                </div> : <Link className="quiet-link" to="/app/profile">Set a target weight <ArrowRight size={13} /></Link>}
                <Suspense fallback={chartFallback}><BodyWeightChart data={weight?.history || []} unit={unit} /></Suspense>
              </section>
            </div>
          </div>

          <section className="dashboard-section nutrition-meal-section">
            <div className="section-heading"><div><span className="eyebrow">BALANCED IDEAS</span><h2>Meal suggestions</h2></div><Soup size={18} /></div>
            <p className="nutrition-section-note">Every suggestion is an optional combination of seeded food portions. Approximate totals are shown before adding.</p>
            <div className="nutrition-meal-grid">
              {mealTypes.map((meal) => {
                const options = mealSuggestions.filter((item) => item.mealType === meal).slice(0, 2);
                return <section className="nutrition-meal-group" key={meal}>
                  <h3>{mealLabels[meal]}</h3>
                  {options.length ? options.map((item) => <article className="nutrition-meal-card" key={item.name}>
                    <div className="nutrition-meal-art"><Soup size={18} /></div>
                    <div><strong>{item.name}</strong><small>{item.ingredients.map((ingredient) => `${ingredient.quantity} × ${ingredient.foodName}`).join(' · ')}</small><small>{nutritionSummary(item.nutrition)}</small></div>
                    <button type="button" className="button button-small" disabled={busy} onClick={() => addMeal(item)}><Plus size={13} /> Add</button>
                  </article>) : <p className="nutrition-empty-small">No suitable suggestions for this preference and remaining target.</p>}
                </section>;
              })}
            </div>
          </section>

          <div className="nutrition-lower-grid">
            <section className="dashboard-section nutrition-history-section">
              <div className="section-heading"><div><span className="eyebrow">RECENT DAYS</span><h2>Food history</h2></div><Clock3 size={18} /></div>
              {history.length ? <div className="nutrition-history-list">{history.slice(0, 7).map((day) => <button type="button" className={`nutrition-history-row${day.date === date ? ' nutrition-history-active' : ''}`} key={day.date} onClick={() => setDate(day.date)}>
                <span>{new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span><strong>{amount(day.totals.calories)} kcal</strong><small>{amount(day.totals.proteinGrams, 1)} g protein · {day.entries.length} entries</small>
              </button>)}</div> : <p className="nutrition-empty-small">Your logged days will appear here.</p>}
              <button type="button" className="text-link nutrition-custom-toggle" onClick={() => setShowCustomFood(!showCustomFood)}><Plus size={15} />{showCustomFood ? 'Close custom food' : 'Create a custom food'}</button>
              {showCustomFood && <form className="nutrition-custom-form" onSubmit={createCustomFood}>
                <label className="field-label">Food name<input name="name" minLength="2" maxLength="80" required /></label>
                <label className="field-label">Category<input name="category" maxLength="40" placeholder="Protein, Grains..." required /></label>
                <label className="field-label">Serving unit<input name="servingUnit" maxLength="30" placeholder="piece, bowl, 100 g" required /></label>
                <label className="field-label">Serving size (g/ml)<input name="servingSize" type="number" min="0.1" max="10000" step="0.1" required /></label>
                <label className="field-label">Calories<input name="calories" type="number" min="0" max="2000" step="0.1" required /></label>
                <label className="field-label">Protein (g)<input name="proteinGrams" type="number" min="0" max="300" step="0.1" required /></label>
                <label className="field-label">Carbohydrates (g)<input name="carbohydratesGrams" type="number" min="0" max="500" step="0.1" required /></label>
                <label className="field-label">Fat (g)<input name="fatGrams" type="number" min="0" max="300" step="0.1" required /></label>
                <fieldset className="nutrition-diet-tags"><legend>Suitable for</legend>
                  <label><input type="checkbox" name="dietaryTags" value="vegetarian" /> Vegetarian</label>
                  <label><input type="checkbox" name="dietaryTags" value="vegan" /> Vegan</label>
                  <label><input type="checkbox" name="dietaryTags" value="pescatarian" /> Pescatarian</label>
                </fieldset>
                <button type="submit" className="button nutrition-custom-submit" disabled={busy}>Save custom food</button>
              </form>}
            </section>
            <section className="dashboard-section nutrition-workout-section">
              <div className="section-heading"><div><span className="eyebrow">TRAINING CONTEXT</span><h2>Recent workouts</h2></div><Weight size={18} /></div>
              {latestWorkouts.length ? <div className="nutrition-history-list">{latestWorkouts.slice(0, 3).map((workout) => <Link className="nutrition-history-row nutrition-workout-row" to={`/app/workouts/history/${workout.id}`} key={workout.id}>
                <span>{workout.name}</span><strong>{amount(displayWeight(workout.volumeKg, unit))} {unit}·reps</strong><small>Completed training volume</small>
              </Link>)}</div> : <div className="progress-empty-inline"><Utensils size={17} /><span>Completed workouts will appear here alongside your nutrition progress.</span><Link to="/app/workouts">Start a workout <ArrowRight size={13} /></Link></div>}
              <div className="nutrition-goal-links"><Link to="/app/progress">View full weight history <ArrowRight size={13} /></Link><Link to="/app/profile">Update profile goals <ArrowRight size={13} /></Link></div>
            </section>
          </div>
          <p className="nutrition-disclaimer">Food values are approximate and vary by recipe, brand, and serving size. Nutrition estimates are for general information only and are not medical advice. Avoid extreme restriction; seek professional guidance for medical or individual dietary needs.</p>
        </>
      )}
    </div>
  );
}
