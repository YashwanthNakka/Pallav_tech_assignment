import { NextRequest, NextResponse } from "next/server";

interface Parameter {
  key: string;
  name: string;
  weight: number;
  desc: string;
  inputType: "PASS_FAIL" | "SCORE";
}

interface Utterance {
  transcript: string;
  start: number;
  end: number;
}

interface Sentiment {
  overall: number;
}

interface Topic {
  topic: string;
  confidence: number;
}

interface Intent {
  intent: string;
  confidence: number;
}

const parameters: Parameter[] = [
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

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

  if (!DEEPGRAM_API_KEY) {
    // Mocked response if no API key
    return NextResponse.json({
      scores: {
        greeting: 5,
        collectionUrgency: 12,
        rebuttalCustomerHandling: 13,
        callEtiquette: 14,
        callDisclaimer: 0,
        correctDisposition: 10,
        callClosing: 5,
        fatalIdentification: 5,
        fatalTapeDiscloser: 0,
        fatalToneLanguage: 15,
      },
      overallFeedback: "The agent was confident and persuasive, though failed to provide disclaimer.",
      observation: "Customer raised objections about penalty. Agent managed well but missed tape disclosure."
    });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    
    const response = await fetch('https://api.deepgram.com/v1/listen?smart_format=true&model=nova-2&language=en&utterances=true&sentiment=true&topics=true&summarize=true&intents=true', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${DEEPGRAM_API_KEY}`,
        'Content-Type': file.type,
      },
      body: buffer,
    });

    if (!response.ok) {
      throw new Error('Deepgram API request failed');
    }

    const data = await response.json();
    const transcript = data.results?.channels[0]?.alternatives[0]?.transcript || "";
    const utterances = data.results?.channels[0]?.alternatives[0]?.utterances || [];
    const sentiment = data.results?.channels[0]?.alternatives[0]?.sentiment || {};
    const topics = data.results?.channels[0]?.alternatives[0]?.topics || [];
    const summary = data.results?.channels[0]?.alternatives[0]?.summarize || "";
    const intents = data.results?.channels[0]?.alternatives[0]?.intents || [];

    if (!transcript) {
      return NextResponse.json({ error: "Transcription failed" }, { status: 500 });
    }

    // Analyze the call based on Deepgram's output
    const scores = {
      greeting: analyzeGreeting(utterances),
      collectionUrgency: analyzeUrgency(utterances),
      rebuttalCustomerHandling: analyzeRebuttal(utterances),
      callEtiquette: analyzeEtiquette(sentiment),
      callDisclaimer: analyzeDisclaimer(utterances),
      correctDisposition: analyzeDisposition(utterances, intents),
      callClosing: analyzeClosing(utterances),
      fatalIdentification: analyzeIdentification(utterances),
      fatalTapeDiscloser: analyzeTapeDisclosure(utterances),
      fatalToneLanguage: analyzeToneLanguage(sentiment, utterances),
    };

    const overallFeedback = generateOverallFeedback(scores, sentiment, summary);
    const observation = generateObservation(utterances, topics, sentiment);

    return NextResponse.json({
      scores,
      overallFeedback,
      observation,
      parameters // Include parameters in response for frontend reference
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}

// Analysis helper functions
function analyzeGreeting(utterances: Utterance[]): number {
  if (!utterances.length) return 0;
  const firstUtterance = utterances[0];
  const greetingTime = firstUtterance.start;
  return greetingTime <= 5 ? 5 : 0;
}

function analyzeUrgency(utterances: Utterance[]): number {
  const urgencyKeywords = ['urgent', 'immediately', 'asap', 'critical', 'important'];
  const urgencyScore = utterances.reduce((score, utterance) => {
    const text = utterance.transcript.toLowerCase();
    const hasUrgency = urgencyKeywords.some(keyword => text.includes(keyword));
    return score + (hasUrgency ? 3 : 0);
  }, 0);
  return Math.min(15, urgencyScore);
}

function analyzeRebuttal(utterances: Utterance[]): number {
  const objectionKeywords = ['can\'t', 'won\'t', 'don\'t', 'not possible', 'too expensive'];
  const rebuttalScore = utterances.reduce((score, utterance) => {
    const text = utterance.transcript.toLowerCase();
    const hasObjection = objectionKeywords.some(keyword => text.includes(keyword));
    return score + (hasObjection ? 3 : 0);
  }, 0);
  return Math.min(15, rebuttalScore);
}

function analyzeEtiquette(sentiment: Sentiment): number {
  const baseScore = 10;
  const sentimentScore = sentiment.overall > 0 ? 4 : 0;
  return Math.min(15, baseScore + sentimentScore);
}

function analyzeDisclaimer(utterances: Utterance[]): number {
  const disclaimerKeywords = ['recording', 'recorded', 'tape', 'monitoring'];
  const hasDisclaimer = utterances.some(utterance => 
    disclaimerKeywords.some(keyword => 
      utterance.transcript.toLowerCase().includes(keyword)
    )
  );
  return hasDisclaimer ? 5 : 0;
}

function analyzeDisposition(utterances: Utterance[], intents: Intent[]): number {
  const hasDisposition = intents.some(intent => 
    intent.intent === 'disposition' || intent.intent === 'category'
  );
  return hasDisposition ? 10 : 0;
}

function analyzeClosing(utterances: Utterance[]): number {
  if (!utterances.length) return 0;
  const lastUtterance = utterances[utterances.length - 1];
  const closingKeywords = ['thank', 'thanks', 'appreciate', 'goodbye', 'bye'];
  const hasClosing = closingKeywords.some(keyword => 
    lastUtterance.transcript.toLowerCase().includes(keyword)
  );
  return hasClosing ? 5 : 0;
}

function analyzeIdentification(utterances: Utterance[]): number {
  const idKeywords = ['name', 'id', 'account', 'customer'];
  const hasIdentification = utterances.some(utterance => 
    idKeywords.some(keyword => 
      utterance.transcript.toLowerCase().includes(keyword)
    )
  );
  return hasIdentification ? 5 : 0;
}

function analyzeTapeDisclosure(utterances: Utterance[]): number {
  const disclosureKeywords = ['recording', 'recorded', 'tape', 'monitoring'];
  const hasDisclosure = utterances.some(utterance => 
    disclosureKeywords.some(keyword => 
      utterance.transcript.toLowerCase().includes(keyword)
    )
  );
  return hasDisclosure ? 10 : 0;
}

function analyzeToneLanguage(sentiment: Sentiment, utterances: Utterance[]): number {
  const negativeKeywords = ['abuse', 'threat', 'angry', 'rude'];
  const hasNegativeLanguage = utterances.some(utterance => 
    negativeKeywords.some(keyword => 
      utterance.transcript.toLowerCase().includes(keyword)
    )
  );
  return hasNegativeLanguage ? 0 : 15;
}

function generateOverallFeedback(scores: Record<string, number>, sentiment: Sentiment, summary: string): string {
  const totalScore = Object.values(scores).reduce((a: number, b: number) => a + b, 0);
  const maxScore = 100;
  const percentage = (totalScore / maxScore) * 100;
  
  let feedback = `Overall score: ${percentage.toFixed(1)}%. `;
  feedback += summary || "The call was processed successfully.";
  
  if (sentiment.overall < 0) {
    feedback += " There were some negative sentiments detected.";
  }
  
  return feedback;
}

function generateObservation(utterances: Utterance[], topics: Topic[], sentiment: Sentiment): string {
  const observations = [];
  
  if (topics.length > 0) {
    observations.push(`Main topics discussed: ${topics.map(t => t.topic).join(', ')}`);
  }
  
  if (sentiment.overall !== 0) {
    observations.push(`Overall sentiment was ${sentiment.overall > 0 ? 'positive' : 'negative'}`);
  }
  
  return observations.join('. ') || "No specific observations available.";
} 