import logo from './logo.svg';
import './App.css';
import ExtractorNew from './components/ExtractorNew';
import MiseAJourPage from './MiseAJour/MiseAJourPage';

import React, { useState } from 'react';

import NavBar from './NavBar/NavBar';

function App() {
  const [currentStep, setCurrentStep] = useState('setup');

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 w-full">
      <NavBar currentStep={currentStep} setCurrentStep={setCurrentStep} />
      {currentStep === 'miseajour' ? (
        <MiseAJourPage />
      ) : (
        <ExtractorNew currentStep={currentStep} setCurrentStep={setCurrentStep} />
      )}
    </div>
  );
}

export default App;
