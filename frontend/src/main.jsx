import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { LangProvider, useT } from './i18n.jsx';
import CheckIn from './pages/CheckIn.jsx';
import Manager from './pages/Manager.jsx';
import Outcome from './pages/Outcome.jsx';
import Impact from './pages/Impact.jsx';
import './index.css';

function Shell() {
  const { t, lang, setLang } = useT();
  return (
    <>
      <header className="top">
        <span className="brand">MessWise</span>
        <nav>
          <NavLink to="/checkin">{t('checkin')}</NavLink>
          <NavLink to="/manager">{t('manager')}</NavLink>
          <NavLink to="/impact">{t('impact')}</NavLink>
        </nav>
        <button className="lang" onClick={() => setLang(lang === 'en' ? 'hi' : 'en')} aria-label="Switch language">
          {lang === 'en' ? 'हिंदी' : 'English'}
        </button>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/checkin" replace />} />
          <Route path="/checkin" element={<CheckIn />} />
          <Route path="/manager" element={<Manager />} />
          <Route path="/outcome/:mealId" element={<Outcome />} />
          <Route path="/impact" element={<Impact />} />
          <Route path="*" element={<Navigate to="/checkin" replace />} />
        </Routes>
      </main>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LangProvider>
      <HashRouter><Shell /></HashRouter>
    </LangProvider>
  </React.StrictMode>
);
