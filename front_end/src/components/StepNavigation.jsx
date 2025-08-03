import React from "react";
import {
  Settings,
  Search,
  ZoomIn,
  ArrowRight,
} from "lucide-react";

const StepNavigation = ({ currentStep, setCurrentStep }) => {
  return (
    <div className="step-navigation">
      <div className="step-indicators">
        <div
          className={`step-indicator ${currentStep === "setup" ? "active" : ""}`}
          onClick={() => setCurrentStep("setup")}
        >
          <Settings className="step-icon" />
          <span className="step-label">1. Préparation</span>
        </div>
        
        <ArrowRight className="step-arrow" />
        
        <div
          className={`step-indicator ${currentStep === "extract" ? "active" : ""}`}
          onClick={() => setCurrentStep("extract")}
        >
          <Search className="step-icon" />
          <span className="step-label">2. Extraction</span>
        </div>
        
        <ArrowRight className="step-arrow" />
        
        <div
          className={`step-indicator ${currentStep === "dataprep" ? "active" : ""}`}
          onClick={() => setCurrentStep("dataprep")}
        >
          <ZoomIn className="step-icon" />
          <span className="step-label">3. Paramétrage</span>
        </div>
      </div>
    </div>
  );
};

export default StepNavigation; 