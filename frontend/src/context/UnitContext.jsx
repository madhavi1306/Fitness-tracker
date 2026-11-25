import { createContext, useContext, useState } from 'react';

const UnitContext = createContext(null);

export function UnitProvider({ children }) {
  const [unit, setUnit] = useState(() => localStorage.getItem('formline.unit') || 'kg');
  function updateUnit(nextUnit) {
    localStorage.setItem('formline.unit', nextUnit);
    setUnit(nextUnit);
  }
  return <UnitContext.Provider value={{ unit, setUnit: updateUnit }}>{children}</UnitContext.Provider>;
}

export function useUnits() {
  const context = useContext(UnitContext);
  if (!context) throw new Error('useUnits must be used within UnitProvider');
  return context;
}
