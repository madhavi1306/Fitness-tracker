import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFoodMentions, workoutVolume } from '../src/services/voice.service.js';

const foods = [
  { id: 'egg', name: 'Egg', servingUnit: 'large egg', calories: 72, proteinGrams: 6.3, carbohydratesGrams: 0.4, fatGrams: 4.8 },
  { id: 'chapati', name: 'Chapati', servingUnit: 'piece', calories: 120, proteinGrams: 3.5, carbohydratesGrams: 18, fatGrams: 3.5 },
  { id: 'dal', name: 'Dal', servingUnit: 'bowl', calories: 180, proteinGrams: 10, carbohydratesGrams: 26, fatGrams: 4 },
  { id: 'paneer', name: 'Paneer', servingUnit: '100 g', servingSize: 100, calories: 265, proteinGrams: 18.3, carbohydratesGrams: 1.2, fatGrams: 20.8 },
];

test('voice food parsing recognizes numeric and spoken quantities with serving totals', () => {
  const items = parseFoodMentions('I ate two eggs, 2 chapatis and a bowl of dal', foods);
  assert.deepEqual(items.map(({ foodName, quantity }) => [foodName, quantity]), [
    ['Egg', 2],
    ['Chapati', 2],
    ['Dal', 1],
  ]);
  assert.equal(items.reduce((total, item) => total + item.nutrition.calories, 0), 564);
});

test('voice food parsing ignores zero or excessive quantities', () => {
  assert.deepEqual(parseFoodMentions('I ate 0 eggs and 101 chapatis', foods), []);
});

test('voice food parsing converts gram quantities into the food library serving unit', () => {
  const [paneer] = parseFoodMentions('How much protein is in 100 grams of paneer?', foods);
  assert.equal(paneer.quantity, 1);
  assert.equal(paneer.nutrition.proteinGrams, 18.3);
});

test('workout volume includes only completed sets', () => {
  assert.equal(workoutVolume({
    exercises: [{ sets: [
      { weightKg: 50, reps: 8, completed: true },
      { weightKg: 60, reps: 5, completed: false },
    ] }],
  }), 400);
});
