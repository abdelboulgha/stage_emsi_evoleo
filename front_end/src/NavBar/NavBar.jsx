import React from "react";
import {
  Settings,
  Search,
  ZoomIn,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import "./NavBar.css";

const NavBar = ({ currentStep, setCurrentStep }) => {
  return (
    <header className="navbar-header">
      <div className="navbar-container">
        <div className="navbar-title-section">
          <h1 className="navbar-title">
            {currentStep === "setup"
              ? "Configuration Comptable"
              : currentStep === "extract"
              ? "Extraction de Factures"
              : currentStep === "dataprep"
              ? "Configuration des Mappings"
              : "Mise à jour des Factures"}
          </h1>
        </div>

        <div className="navbar-steps">
          <div
            className={`navbar-step ${currentStep === "setup" ? "active" : ""}`}
            onClick={() => setCurrentStep("setup")}
          >
            <Settings className="navbar-step-icon" />
            <span className="navbar-step-text">1. Préparation</span>
          </div>
          <ArrowRight className="navbar-arrow" />
          <div
            className={`navbar-step ${currentStep === "extract" ? "active" : ""}`}
            onClick={() => setCurrentStep("extract")}
          >
            <Search className="navbar-step-icon" />
            <span className="navbar-step-text">2. Extraction</span>
          </div>
          <ArrowRight className="navbar-arrow" />
          <div
            className={`navbar-step ${currentStep === "dataprep" ? "active" : ""}`}
            onClick={() => setCurrentStep("dataprep")}
          >
            <ZoomIn className="navbar-step-icon" />
            <span className="navbar-step-text">3. Paramétrage</span>
          </div>
          <ArrowRight className="navbar-arrow" />
          <div
            className={`navbar-step ${currentStep === "miseajour" ? "active" : ""}`}
            onClick={() => setCurrentStep("miseajour")}
          >
            <RefreshCw className="navbar-step-icon" />
            <span 
              className="navbar-step-text"
              style={{
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                wordWrap: 'normal',
                wordBreak: 'keep-all',
                hyphens: 'none',
                maxWidth: '120px',
                display: 'inline-block',
                lineHeight: '1.2',
                fontSize: '0.875rem',
                fontWeight: '600'
              }}
            >
              4. Mise&nbsp;à&nbsp;jour
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default NavBar; 