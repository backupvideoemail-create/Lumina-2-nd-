import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Flag, CheckCircle2 } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const ReportModal: React.FC = () => {
  const { reportModalGenId, setReportModalGenId } = useApp();
  const [reason, setReason] = useState('Inappropriate or offensive visual');
  const [details, setDetails] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!reportModalGenId) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generationId: reportModalGenId,
          reason: `${reason}: ${details}`
        })
      });
      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        setReportModalGenId(null);
      }, 1800);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="absolute inset-0" onClick={() => setReportModalGenId(null)} />

      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        className="relative w-full max-w-sm bg-[#121217] border border-white/10 rounded-3xl p-6 shadow-2xl z-10 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-stone-200">
            <Flag className="w-4 h-4 text-red-400" />
            <h4 className="text-sm font-bold text-white">Report Generation</h4>
          </div>
          <button
            onClick={() => setReportModalGenId(null)}
            className="p-1 text-stone-400 hover:text-white rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!submitted ? (
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <p className="text-xs text-stone-400 leading-relaxed">
              Help us keep AI Prime STUDIO safe. What is wrong with this AI generation?
            </p>

            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full p-2.5 bg-stone-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-[#d4af37]"
            >
              <option value="Inappropriate or offensive visual">Inappropriate or offensive visual</option>
              <option value="Defective rendering or distortion">Defective rendering or distortion</option>
              <option value="Copyright or intellectual property concern">Copyright or IP concern</option>
              <option value="Other quality issue">Other quality issue</option>
            </select>

            <textarea
              rows={3}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Optional notes or details..."
              className="w-full p-2.5 bg-stone-900 border border-white/10 rounded-xl text-xs text-white placeholder-stone-500 focus:outline-none focus:border-[#d4af37]"
            />

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setReportModalGenId(null)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-stone-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-bold text-white"
              >
                {submitting ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </form>
        ) : (
          <div className="py-6 text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
            <p className="text-sm font-semibold text-white">Report Received</p>
            <p className="text-xs text-stone-400">Our safety team will review this output.</p>
          </div>
        )}
      </motion.div>
    </div>
  );
};
