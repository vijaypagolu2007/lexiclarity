import React from 'react';
import { AlertTriangle } from 'lucide-react';

export const DisclaimerBanner: React.FC = () => {
  return (
    <div className="bg-amber-50/90 border-b border-amber-200/80 px-4 py-2.5 text-xs text-amber-900 flex items-center justify-center space-x-2">
      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
      <span>
        <strong>Legal Disclaimer:</strong> LexiClarity is an informational AI accessibility tool for understanding legal text. It is <strong>not legal advice</strong> and does not create an attorney-client relationship. Always consult a qualified lawyer before signing or negotiating.
      </span>
    </div>
  );
};
