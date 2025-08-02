import React from "react";
import {
  Settings,
  Search,
  ZoomIn,
  ArrowRight,
} from "lucide-react";

const NavBar = ({ currentStep, setCurrentStep }) => {
  return (
    <header className="relative bg-white/10 backdrop-blur-lg border-b border-white/20 py-2 w-full">
      <div className="px-6 py-2 w-full">
        <div className="text-center mb-2">
          <h1 className="text-3xl font-bold text-white mb-2">
            {currentStep === "setup"
              ? "Configuration Comptable"
              : currentStep === "extract"
              ? "Extraction de Factures"
              : "Configuration des Mappings"}
          </h1>
        </div>

        <div className="flex justify-center items-center gap-4">
          <div
            className={`flex items-center gap-2 px-4 py-2 rounded-xl cursor-pointer transition-all ${
              currentStep === "setup"
                ? "bg-white text-indigo-600"
                : "text-white/70 hover:text-white"
            }`}
            onClick={() => setCurrentStep("setup")}
          >
            <Settings className="w-4 h-4" />
            <span className="font-medium">1. Préparation</span>
          </div>
          <ArrowRight className="w-4 h-4 text-white/50" />
          <div
            className={`flex items-center gap-2 px-4 py-2 rounded-xl cursor-pointer transition-all ${
              currentStep === "extract"
                ? "bg-white text-indigo-600"
                : "text-white/70 hover:text-white"
            }`}
            onClick={() => setCurrentStep("extract")}
          >
            <Search className="w-4 h-4" />
            <span className="font-medium">2. Extraction</span>
          </div>
          <ArrowRight className="w-4 h-4 text-white/50" />
          <div
            className={`flex items-center gap-2 px-4 py-2 rounded-xl cursor-pointer transition-all ${
              currentStep === "dataprep"
                ? "bg-white text-indigo-600"
                : "text-white/70 hover:text-white"
            }`}
            onClick={() => setCurrentStep("dataprep")}
          >
            <ZoomIn className="w-4 h-4" />
            <span className="font-medium">3. Paramétrage</span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default NavBar; 