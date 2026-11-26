import bcrypt from 'bcrypt';
import { seedExercises } from '../data/exercises.js';
import { seedFoods } from '../data/foods.js';

const now = () => new Date();
const id = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

export const memoryState = {
  users: [],
  exercises: seedExercises.map((exercise) => ({
    id: id('exercise'),
    ...exercise,
    imageUrl: null,
    ownerId: null,
    createdAt: now(),
    updatedAt: now(),
  })),
  templates: [],
  workoutPlans: [],
  sessions: [],
  personalRecords: [],
  weightEntries: [],
  foods: seedFoods.map((food) => ({
    id: id('food'),
    ...food,
    ownerId: null,
    createdAt: now(),
    updatedAt: now(),
  })),
  foodLogs: [],
  nutritionTargets: [],
  dietPlans: [],
};

function matchesWhere(item, where = {}) {
  if (!where) return true;
  if (typeof where.id === 'string' && item.id !== where.id) return false;
  if (where.id?.in && !where.id.in.includes(item.id)) return false;
  if (where.ownerId && item.ownerId !== where.ownerId) return false;
  if (where.ownerId === null && item.ownerId !== null) return false;
  if (where.ownerId == null && 'ownerId' in where) return item.ownerId == null;
  if (where.finishedAt?.not) {
    if (item.finishedAt == null) return false;
  }
  if (where.muscleGroup && item.muscleGroup !== where.muscleGroup) return false;
  if (where.equipment && item.equipment !== where.equipment) return false;
  if (where.email && item.email !== where.email) return false;
  if (where.date && new Date(item.date).getTime() !== new Date(where.date).getTime()) return false;
  for (const field of ['date', 'startDate', 'endDate']) {
    const filter = where[field];
    if (!filter || typeof filter !== 'object') continue;
    const value = new Date(item[field]).getTime();
    if (filter.gte && value < new Date(filter.gte).getTime()) return false;
    if (filter.lte && value > new Date(filter.lte).getTime()) return false;
  }
  if (where.isActive !== undefined && item.isActive !== where.isActive) return false;
  if (where.planId && item.planId !== where.planId) return false;
  if (where.templateId && item.templateId !== where.templateId) return false;
  if (where.sessionId && item.sessionId !== where.sessionId) return false;
  if (where.exerciseId && item.exerciseId !== where.exerciseId) return false;
  if (where.name?.equals && item.name?.toLowerCase() !== where.name.equals.toLowerCase()) return false;
  if (where.NOT?.id && item.id === where.NOT.id) return false;
  if (where.OR) {
    const accepted = where.OR.some((condition) => {
      if (condition.ownerId === null) return item.ownerId == null;
      if (condition.ownerId) return item.ownerId === condition.ownerId;
      return false;
    });
    if (!accepted) return false;
  }
  if (where.AND) {
    for (const condition of where.AND) {
      if (condition.OR) {
        const search = condition.OR.map((field) => field.name?.contains || field.description?.contains).find(Boolean);
        if (search) {
          const text = `${item.name || ''} ${item.description || ''} ${item.muscleGroup || ''}`.toLowerCase();
          if (!text.includes(search.toLowerCase())) return false;
        }
      } else if (!matchesWhere(item, condition)) return false;
    }
  }
  return true;
}

function applySort(items, orderBy) {
  if (!orderBy) return items;
  const sort = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...items].sort((a, b) => {
    for (const rule of sort) {
      const key = Object.keys(rule)[0];
      const aValue = a[key] ?? '';
      const bValue = b[key] ?? '';
      if (aValue === bValue) continue;
      const comparison = String(aValue).localeCompare(String(bValue));
      return rule[key] === 'desc' ? -comparison : comparison;
    }
    return 0;
  });
}

function selectObject(item, select) {
  if (!select) return item;
  const result = {};
  for (const [key, enabled] of Object.entries(select)) {
    if (enabled) result[key] = item[key];
  }
  return result;
}

function templateWithExercises(template) {
  return {
    ...template,
    exercises: template.exercises.map((item) => ({
      ...item,
      exercise: memoryState.exercises.find((exercise) => exercise.id === item.exerciseId),
    })),
  };
}

function sessionWithExercises(session) {
  return {
    ...session,
    exercises: [...(session.exercises || [])].sort((a, b) => a.order - b.order).map((exercise) => ({
      ...exercise,
      sets: [...(exercise.sets || [])].sort((a, b) => a.setNumber - b.setNumber),
    })),
  };
}

function planDayWithExercises(day, include = {}) {
  const result = { ...day };
  if (include.plan) {
    const plan = memoryState.workoutPlans.find((item) => item.id === day.planId);
    result.plan = plan ? { ...plan, ownerId: plan.ownerId } : null;
  }
  if (include.exercises) {
    result.exercises = [...(day.exercises || [])]
      .sort((left, right) => left.order - right.order)
      .map((item) => ({
        ...item,
        exercise: memoryState.exercises.find((exercise) => exercise.id === item.exerciseId),
      }));
  }
  return result;
}

function workoutPlanWithDays(plan, include) {
  if (!include?.days) return { ...plan };
  return {
    ...plan,
    days: [...(plan.days || [])]
      .sort((left, right) => new Date(left.date) - new Date(right.date))
      .map((day) => planDayWithExercises(day, include.days.include || {})),
  };
}

export const memoryPrisma = {
  user: {
    findUnique: async ({ where, select }) => {
      const user = memoryState.users.find((item) => item.id === where.id || item.email === where.email);
      return user ? selectObject(user, select) : null;
    },
    create: async ({ data }) => {
      const user = {
        id: id('user'),
        ...data,
        activityLevel: data.activityLevel || 'MODERATELY_ACTIVE',
        dietaryPreference: data.dietaryPreference || 'NONE',
        startingWeightKg: data.startingWeightKg ?? data.currentWeightKg,
        createdAt: now(),
        updatedAt: now(),
      };
      memoryState.users.push(user);
      return user;
    },
    update: async ({ where, data }) => {
      const index = memoryState.users.findIndex((item) => item.id === where.id);
      memoryState.users[index] = { ...memoryState.users[index], ...data, updatedAt: now() };
      return memoryState.users[index];
    },
  },
  exercise: {
    findMany: async ({ where, select, orderBy }) => {
      let items = memoryState.exercises.filter((item) => matchesWhere(item, where));
      if (where?.AND) {
        for (const condition of where.AND) {
          if (condition.OR?.[0]?.name?.contains) {
            const text = condition.OR[0].name.contains.toLowerCase();
            items = items.filter((item) => `${item.name} ${item.description} ${item.muscleGroup}`.toLowerCase().includes(text));
          }
        }
      }
      items = applySort(items, orderBy);
      return items.map((item) => selectObject(item, select));
    },
    findFirst: async ({ where, select }) => {
      const item = memoryState.exercises.find((entry) => matchesWhere(entry, where));
      return item ? selectObject(item, select) : null;
    },
    create: async ({ data, select }) => {
      const item = { id: id('exercise'), ...data, createdAt: now(), updatedAt: now() };
      memoryState.exercises.push(item);
      return selectObject(item, select);
    },
    update: async ({ where, data, select }) => {
      const index = memoryState.exercises.findIndex((item) => item.id === where.id);
      memoryState.exercises[index] = { ...memoryState.exercises[index], ...data, updatedAt: now() };
      return selectObject(memoryState.exercises[index], select);
    },
    delete: async ({ where }) => {
      memoryState.exercises = memoryState.exercises.filter((item) => item.id !== where.id);
      return {};
    },
  },
  workoutTemplate: {
    findMany: async ({ where, orderBy }) => applySort(
      memoryState.templates.filter((item) => item.ownerId === where.ownerId).map(templateWithExercises),
      orderBy,
    ),
    findFirst: async ({ where }) => {
      const item = memoryState.templates.find((template) => template.id === where.id && template.ownerId === where.ownerId);
      return item ? templateWithExercises(item) : null;
    },
    create: async ({ data }) => {
      const template = {
        id: id('template'),
        name: data.name,
        notes: data.notes,
        ownerId: data.ownerId,
        exercises: (data.exercises?.create || []).map((item) => ({ id: id('template_exercise'), ...item })),
        createdAt: now(),
        updatedAt: now(),
      };
      memoryState.templates.push(template);
      return templateWithExercises(template);
    },
    update: async ({ where, data }) => {
      const index = memoryState.templates.findIndex((item) => item.id === where.id);
      if (data.exercises?.create) memoryState.templates[index].exercises = data.exercises.create.map((item) => ({ id: id('template_exercise'), ...item }));
      if (data.name !== undefined) memoryState.templates[index].name = data.name;
      if (data.notes !== undefined) memoryState.templates[index].notes = data.notes;
      memoryState.templates[index].updatedAt = now();
      return templateWithExercises(memoryState.templates[index]);
    },
    deleteMany: async ({ where }) => {
      const before = memoryState.templates.length;
      memoryState.templates = memoryState.templates.filter((item) => !(item.id === where.id && item.ownerId === where.ownerId));
      return { count: before - memoryState.templates.length };
    },
  },
  workoutTemplateExercise: {
    count: async ({ where }) => memoryState.templates.reduce((count, template) =>
      count + template.exercises.filter((item) => item.exerciseId === where.exerciseId).length, 0),
    deleteMany: async ({ where }) => {
      const template = memoryState.templates.find((item) => item.id === where.templateId);
      const before = template?.exercises.length || 0;
      if (template) template.exercises = [];
      return { count: before };
    },
  },
  workoutPlan: {
    findMany: async ({ where, include, orderBy, take } = {}) => {
      let plans = memoryState.workoutPlans.filter((item) => matchesWhere(item, where));
      plans = applySort(plans, orderBy);
      if (take) plans = plans.slice(0, take);
      return plans.map((plan) => workoutPlanWithDays(plan, include));
    },
    findFirst: async ({ where, include, orderBy } = {}) => {
      const plans = applySort(memoryState.workoutPlans.filter((item) => matchesWhere(item, where)), orderBy);
      return plans.length ? workoutPlanWithDays(plans[0], include) : null;
    },
    create: async ({ data, include }) => {
      const plan = {
        id: id('workout_plan'),
        ...data,
        createdAt: now(),
        updatedAt: now(),
        days: (data.days?.create || []).map((dayData) => ({
          id: id('workout_plan_day'),
          ...dayData,
          planId: undefined,
          exercises: (dayData.exercises?.create || []).map((item) => ({
            id: id('workout_plan_exercise'),
            ...item,
            dayId: undefined,
          })),
        })),
      };
      plan.days.forEach((day) => { day.planId = plan.id; });
      memoryState.workoutPlans.push(plan);
      return workoutPlanWithDays(plan, include);
    },
    updateMany: async ({ where, data }) => {
      const plans = memoryState.workoutPlans.filter((item) => matchesWhere(item, where));
      plans.forEach((plan) => Object.assign(plan, data, { updatedAt: now() }));
      return { count: plans.length };
    },
    deleteMany: async ({ where }) => {
      const before = memoryState.workoutPlans.length;
      memoryState.workoutPlans = memoryState.workoutPlans.filter((item) => !matchesWhere(item, where));
      return { count: before - memoryState.workoutPlans.length };
    },
  },
  workoutPlanDay: {
    findFirst: async ({ where, include, select } = {}) => {
      const day = memoryState.workoutPlans
        .flatMap((plan) => plan.days)
        .find((item) => matchesWhere(item, where));
      if (!day) return null;
      if (select) return selectObject(day, select);
      return planDayWithExercises(day, include);
    },
    update: async ({ where, data }) => {
      const day = memoryState.workoutPlans.flatMap((plan) => plan.days).find((item) => item.id === where.id);
      if (!day) throw new Error('Scheduled workout day not found');
      Object.assign(day, data);
      return planDayWithExercises(day);
    },
  },
  workoutPlanExercise: {
    deleteMany: async ({ where }) => {
      const day = memoryState.workoutPlans.flatMap((plan) => plan.days).find((item) => item.id === where.dayId);
      const before = day?.exercises.length || 0;
      if (day) day.exercises = [];
      return { count: before };
    },
    createMany: async ({ data }) => {
      for (const item of data) {
        const day = memoryState.workoutPlans.flatMap((plan) => plan.days).find((entry) => entry.id === item.dayId);
        if (day) day.exercises.push({ id: id('workout_plan_exercise'), ...item });
      }
      return { count: data.length };
    },
  },
  workoutSession: {
    create: async ({ data }) => {
      const session = {
        id: id('workout'),
        name: data.name,
        ownerId: data.ownerId,
        templateId: data.templateId,
        planDayId: data.planDayId || null,
        startedAt: now(),
        finishedAt: null,
        durationSeconds: null,
        exercises: (data.exercises?.create || []).map((item) => ({ id: id('session_exercise'), ...item, sets: [] })),
      };
      memoryState.sessions.push(session);
      return sessionWithExercises(session);
    },
    findFirst: async ({ where, include, orderBy } = {}) => {
      const sessions = memoryState.sessions
        .filter((item) => {
          if (where.id && item.id !== where.id) return false;
          if (item.ownerId !== where.ownerId) return false;
          if (Object.prototype.hasOwnProperty.call(where, 'finishedAt') && where.finishedAt === null
            && item.finishedAt != null) return false;
          if (where.finishedAt?.not === null && item.finishedAt == null) return false;
          return true;
        })
        .sort((left, right) => orderBy?.startedAt === 'desc'
          ? right.startedAt - left.startedAt
          : left.startedAt - right.startedAt);
      const session = sessions[0];
      return session ? sessionWithExercises(session) : null;
    },
    findMany: async ({ where }) => memoryState.sessions
      .filter((item) => item.ownerId === where.ownerId && item.finishedAt)
      .sort((a, b) => b.startedAt - a.startedAt)
      .map(sessionWithExercises),
    update: async ({ where, data }) => {
      const session = memoryState.sessions.find((item) => item.id === where.id);
      Object.assign(session, data);
      return sessionWithExercises(session);
    },
  },
  workoutExercise: {
    findFirst: async ({ where }) => {
      const session = memoryState.sessions.find((item) => item.id === where.sessionId);
      const exercise = session?.exercises.find((item) => item.id === where.id);
      return exercise ? { id: exercise.id, name: exercise.name, targetSets: exercise.targetSets } : null;
    },
  },
  workoutSet: {
    create: async ({ data }) => {
      const set = { id: id('set'), ...data, completed: true, completedAt: now() };
      for (const session of memoryState.sessions) {
        const exercise = session.exercises.find((item) => item.id === data.workoutExerciseId);
        if (exercise) {
          exercise.sets.push(set);
          return set;
        }
      }
      return set;
    },
    count: async ({ where }) => {
      for (const session of memoryState.sessions) {
        const exercise = session.exercises.find((item) => item.id === where.workoutExerciseId);
        if (exercise) return exercise.sets.length;
      }
      return 0;
    },
  },
  personalRecord: {
    findMany: async ({ where, orderBy, take }) => {
      const entries = memoryState.personalRecords.filter((item) =>
        item.ownerId === where.ownerId
        && (!where.exerciseName || item.exerciseName === where.exerciseName)
        && (!where.recordType || item.recordType === where.recordType));
      const sorted = [...entries].sort((a, b) => new Date(b.achievedAt) - new Date(a.achievedAt));
      if (take) sorted.length = Math.min(take, sorted.length);
      return sorted;
    },
    create: async ({ data }) => {
      const record = { id: id('pr'), ...data, achievedAt: data.achievedAt || now() };
      memoryState.personalRecords.push(record);
      return record;
    },
  },
  weightEntry: {
    findMany: async ({ where, orderBy }) => {
      const entries = memoryState.weightEntries.filter((entry) => entry.ownerId === where.ownerId);
      return [...entries].sort((a, b) => new Date(a.date) - new Date(b.date));
    },
    upsert: async ({ where, create, update }) => {
      const entryDate = where.ownerId_date.date;
      const existing = memoryState.weightEntries.find((item) =>
        item.ownerId === where.ownerId_date.ownerId
        && new Date(item.date).toDateString() === new Date(entryDate).toDateString());
      if (existing) {
        Object.assign(existing, update, { updatedAt: now() });
        return existing;
      }
      const entry = { id: id('weight'), ...create, createdAt: now(), updatedAt: now() };
      memoryState.weightEntries.push(entry);
      return entry;
    },
  },
  food: {
    findMany: async ({ where, orderBy, take } = {}) => {
      let foods = [...memoryState.foods];
      if (where?.AND) {
        for (const condition of where.AND) {
          if (condition.OR) {
            foods = foods.filter((food) => condition.OR.some((owner) =>
              Object.prototype.hasOwnProperty.call(owner, 'ownerId') && food.ownerId === owner.ownerId));
          } else if (condition.name?.contains) {
            const search = condition.name.contains.toLowerCase();
            foods = foods.filter((food) => food.name.toLowerCase().includes(search));
          }
        }
      } else if (where?.OR) {
        foods = foods.filter((food) => where.OR.some((owner) =>
          Object.prototype.hasOwnProperty.call(owner, 'ownerId') && food.ownerId === owner.ownerId));
      }
      foods = applySort(foods, orderBy);
      return take ? foods.slice(0, take) : foods;
    },
    findFirst: async ({ where }) => memoryState.foods.find((food) => {
      if (where.id && food.id !== where.id) return false;
      if (Object.prototype.hasOwnProperty.call(where, 'ownerId') && food.ownerId !== where.ownerId) return false;
      if (where.name?.equals && food.name.toLowerCase() !== where.name.equals.toLowerCase()) return false;
      if (where.OR && !where.OR.some((owner) =>
        Object.prototype.hasOwnProperty.call(owner, 'ownerId') && food.ownerId === owner.ownerId)) return false;
      return true;
    }) || null,
    create: async ({ data }) => {
      const food = { id: id('food'), ...data, createdAt: now(), updatedAt: now() };
      memoryState.foods.push(food);
      return food;
    },
  },
  foodLog: {
    findMany: async ({ where, orderBy } = {}) => {
      let entries = memoryState.foodLogs.filter((entry) => entry.ownerId === where?.ownerId);
      if (where?.loggedAt?.gte) entries = entries.filter((entry) => new Date(entry.loggedAt) >= where.loggedAt.gte);
      if (where?.loggedAt?.lte) entries = entries.filter((entry) => new Date(entry.loggedAt) <= where.loggedAt.lte);
      const direction = orderBy?.loggedAt === 'asc' ? 1 : -1;
      return [...entries].sort((a, b) => direction * (new Date(a.loggedAt) - new Date(b.loggedAt)));
    },
    findFirst: async ({ where }) => memoryState.foodLogs.find((entry) =>
      entry.id === where.id && entry.ownerId === where.ownerId) || null,
    create: async ({ data }) => {
      const entry = { id: id('food_log'), ...data, createdAt: now(), updatedAt: now() };
      memoryState.foodLogs.push(entry);
      return entry;
    },
    update: async ({ where, data }) => {
      const index = memoryState.foodLogs.findIndex((entry) => entry.id === where.id);
      if (index < 0) throw new Error('Food log entry not found');
      memoryState.foodLogs[index] = { ...memoryState.foodLogs[index], ...data, updatedAt: now() };
      return memoryState.foodLogs[index];
    },
    delete: async ({ where }) => {
      const index = memoryState.foodLogs.findIndex((entry) => entry.id === where.id);
      if (index < 0) throw new Error('Food log entry not found');
      const [entry] = memoryState.foodLogs.splice(index, 1);
      return entry;
    },
  },
  nutritionTarget: {
    findUnique: async ({ where }) => memoryState.nutritionTargets.find((target) => target.ownerId === where.ownerId) || null,
    update: async ({ where, data }) => {
      const target = memoryState.nutritionTargets.find((item) => item.ownerId === where.ownerId);
      if (!target) throw new Error('Nutrition target not found');
      Object.assign(target, data, { updatedAt: now() });
      return target;
    },
    upsert: async ({ where, create, update }) => {
      const existing = memoryState.nutritionTargets.find((target) => target.ownerId === where.ownerId);
      if (existing) {
        Object.assign(existing, update, { updatedAt: now() });
        return existing;
      }
      const target = { id: id('nutrition_target'), ...create, createdAt: now(), updatedAt: now() };
      memoryState.nutritionTargets.push(target);
      return target;
    },
  },
  dietPlan: {
    findMany: async ({ where, include, orderBy } = {}) => {
      let plans = memoryState.dietPlans.filter((plan) => matchesWhere(plan, where));
      if (orderBy) {
        const primary = Array.isArray(orderBy) ? orderBy[0] : orderBy;
        const [field, direction] = Object.entries(primary)[0] || [];
        if (field) plans = [...plans].sort((a, b) => {
          const left = new Date(a[field] || 0).getTime();
          const right = new Date(b[field] || 0).getTime();
          return direction === 'desc' ? right - left : left - right;
        });
      }
      return plans.map((plan) => include?.meals ? {
        ...plan,
        meals: (plan.meals || []).map((meal) => ({ ...meal })),
      } : { ...plan });
    },
    findFirst: async ({ where, include } = {}) => {
      const plan = memoryState.dietPlans.find((item) => matchesWhere(item, where)) || null;
      return plan && include?.meals ? { ...plan, meals: (plan.meals || []).map((meal) => ({ ...meal })) } : plan ? { ...plan } : null;
    },
    create: async ({ data, include }) => {
      const plan = {
        id: id('diet_plan'),
        ownerId: data.ownerId,
        name: data.name,
        date: data.date,
        goal: data.goal,
        dietaryPreference: data.dietaryPreference,
        estimatedCalories: data.estimatedCalories,
        estimatedProteinGrams: data.estimatedProteinGrams,
        estimatedCarbsGrams: data.estimatedCarbsGrams,
        estimatedFatGrams: data.estimatedFatGrams,
        createdAt: now(),
        updatedAt: now(),
        meals: (data.meals?.create || []).map((meal) => ({
          id: id('diet_meal'),
          planId: '',
          mealType: meal.mealType,
          name: meal.name,
          ingredients: meal.ingredients,
          nutrition: meal.nutrition,
        })),
      };
      plan.meals.forEach((meal) => { meal.planId = plan.id; });
      memoryState.dietPlans.push(plan);
      return include?.meals ? { ...plan, meals: plan.meals.map((meal) => ({ ...meal })) } : { ...plan };
    },
    update: async ({ where, data, include }) => {
      const plan = memoryState.dietPlans.find((item) => item.id === where.id);
      if (!plan) throw new Error('Diet plan not found');
      const { meals, ...fields } = data;
      Object.assign(plan, fields, { updatedAt: now() });
      if (meals?.deleteMany !== undefined) plan.meals = [];
      if (meals?.create) {
        plan.meals.push(...meals.create.map((meal) => ({
          id: id('diet_meal'),
          planId: plan.id,
          ...meal,
        })));
      }
      return include?.meals ? { ...plan, meals: plan.meals.map((meal) => ({ ...meal })) } : { ...plan };
    },
    delete: async ({ where }) => {
      const index = memoryState.dietPlans.findIndex((plan) => plan.id === where.id);
      if (index < 0) throw new Error('Diet plan not found');
      const [plan] = memoryState.dietPlans.splice(index, 1);
      return plan;
    },
  },
  $transaction: async (callback) => callback({
    workoutTemplateExercise: memoryPrisma.workoutTemplateExercise,
    workoutTemplate: memoryPrisma.workoutTemplate,
    workoutPlan: memoryPrisma.workoutPlan,
    workoutPlanDay: memoryPrisma.workoutPlanDay,
    workoutPlanExercise: memoryPrisma.workoutPlanExercise,
    dietPlan: memoryPrisma.dietPlan,
  }),
  $disconnect: async () => {},
};
