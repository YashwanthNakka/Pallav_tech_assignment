"use client";
import React, { useState, useRef, useEffect } from "react";
import styles from "./page.module.css";

interface Scores {
  [key: string]: number;
}

interface FeedbackResponse {
  scores: Scores;
  overallFeedback: string;
  observation: string;
}

const parameters = [
  { key: "greeting", name: "Greeting", weight: 5, desc: "Call opening within 5 seconds", inputType: "PASS_FAIL" },
  { key: "collectionUrgency", name: "Collection Urgency", weight: 15, desc: "Create urgency, cross-questioning", inputType: "SCORE" },
  { key: "rebuttalCustomerHandling", name: "Rebuttal Handling", weight: 15, desc: "Address penalties, objections", inputType: "SCORE" },
  { key: "callEtiquette", name: "Call Etiquette", weight: 15, desc: "Tone, empathy, clear speech", inputType: "SCORE" },
  { key: "callDisclaimer", name: "Call Disclaimer", weight: 5, desc: "Take permission before ending", inputType: "PASS_FAIL" },
  { key: "correctDisposition", name: "Correct Disposition", weight: 10, desc: "Use correct category with remark", inputType: "PASS_FAIL" },
  { key: "callClosing", name: "Call Closing", weight: 5, desc: "Thank the customer properly", inputType: "PASS_FAIL" },
  { key: "fatalIdentification", name: "Identification", weight: 5, desc: "Missing agent/customer info", inputType: "PASS_FAIL" },
  { key: "fatalTapeDiscloser", name: "Tape Disclosure", weight: 10, desc: "Inform customer about recording", inputType: "PASS_FAIL" },
  { key: "fatalToneLanguage", name: "Tone & Language", weight: 15, desc: "No abusive or threatening speech", inputType: "PASS_FAIL" },
];

export default function Home() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackResponse | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Cleanup audio URL when component unmounts or file changes
  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && (file.type === "audio/mp3" || file.type === "audio/wav" || file.type === "audio/mpeg")) {
      // Cleanup previous URL if exists
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      setAudioFile(file);
      setAudioUrl(URL.createObjectURL(file));
      setFeedback(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.type === "audio/mp3" || file.type === "audio/wav" || file.type === "audio/mpeg")) {
      // Cleanup previous URL if exists
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      setAudioFile(file);
      setAudioUrl(URL.createObjectURL(file));
      setFeedback(null);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleProcess = async () => {
    if (!audioFile) return;
    setLoading(true);
    setFeedback(null);
    const formData = new FormData();
    formData.append("file", audioFile);
    const res = await fetch("/api/analyze-call", {
      method: "POST",
      body: formData,
    });
    if (res.ok) {
      const data = await res.json();
      setFeedback(data);
    } else {
      setFeedback(null);
    }
    setLoading(false);
  };

  return (
    <main className={styles.container}>
      <h1 className={styles.title}>Call Recording Analyzer</h1>
      <div
        className={styles.dropzone}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <input
          type="file"
          accept=".mp3,.wav,audio/mp3,audio/wav,audio/mpeg"
          onChange={handleFileChange}
          className={styles.fileInput}
        />
        <span>Drag & Drop or Click to Upload .mp3/.wav</span>
      </div>
      {audioUrl && (
        <div className={styles.audioPlayerWrapper}>
          <audio ref={audioRef} controls src={audioUrl} className={styles.audioPlayer} />
        </div>
      )}
      <button
        className={styles.processBtn}
        onClick={handleProcess}
        disabled={!audioFile || loading}
      >
        {loading ? "Processing..." : "Process"}
      </button>
      {feedback && (
        <div className={styles.feedbackSection}>
          <h2>Scores</h2>
          <table className={styles.scoresTable}>
            <thead>
              <tr>
                <th>Parameter</th>
                <th>Score</th>
                <th>Max</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {parameters.map((param) => (
                <tr key={param.key}>
                  <td>{param.name}</td>
                  <td>{feedback.scores[param.key]}</td>
                  <td>{param.weight}</td>
                  <td>{param.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={styles.textFields}>
            <div>
              <label>Overall Feedback</label>
              <textarea value={feedback.overallFeedback} readOnly className={styles.textarea} />
            </div>
            <div>
              <label>Observation</label>
              <textarea value={feedback.observation} readOnly className={styles.textarea} />
            </div>
          </div>
        </div>
      )}
      {feedback && (
        <div className={styles.resultsContainer}>
          <h2>Analysis Results</h2>
          <div className={styles.resultsBox}>
            <pre className={styles.jsonBox}>
              {JSON.stringify({
                scores: feedback.scores,
                overallFeedback: feedback.overallFeedback,
                observation: feedback.observation
              }, null, 2)}
            </pre>
            <button 
              className={styles.copyButton}
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify({
                  scores: feedback.scores,
                  overallFeedback: feedback.overallFeedback,
                  observation: feedback.observation
                }, null, 2));
              }}
            >
              Copy Results
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
