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
  sentiment: string;
  sentiment_score: number;
}

interface Sentiment {
  sentiment: string;
  sentiment_score: number;
}

interface Topic {
  topic: string;
  confidence_score: number;
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
    
    const response = await fetch('https://api.deepgram.com/v1/listen?smart_format=true&model=nova-2&language=hi&utterances=true&sentiment=true&topics=true&summarize=true&intents=true', {
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
    console.log('Raw Deepgram API Response:', JSON.stringify(data, null, 2));
    
    // Parse the response according to Deepgram's structure
    const transcript = data.results?.channels[0]?.alternatives[0]?.transcript || "";
    const utterances = data.results?.channels[0]?.alternatives[0]?.utterances || [];
    const sentiment = {
      sentiment: data.results?.channels[0]?.alternatives[0]?.sentiment || 'neutral',
      sentiment_score: data.results?.channels[0]?.alternatives[0]?.sentiment_score || 0
    };
    const topics = data.results?.channels[0]?.alternatives[0]?.topics || [];
    const intents = data.results?.channels[0]?.alternatives[0]?.intents || [];

    // Log the actual content we're analyzing
    console.log('Call Content Analysis:', {
      transcript: transcript.substring(0, 200) + '...', // First 200 chars
      utterances: utterances.map((u: Utterance) => ({
        text: u.transcript,
        start: u.start,
        end: u.end,
        sentiment: u.sentiment,
        sentiment_score: u.sentiment_score
      })),
      topics: topics.map((t: Topic) => ({
        topic: t.topic,
        confidence: t.confidence_score
      })),
      intents: intents.map((i: Intent) => ({
        intent: i.intent,
        confidence: i.confidence
      }))
    });

    if (!transcript) {
      console.error('No transcript found in Deepgram response');
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

    console.log('Detailed Analysis Results:', {
      scores,
      sentiment,
      topics,
      transcriptLength: transcript.length,
      utteranceCount: utterances.length,
      firstUtterance: utterances[0]?.transcript,
      lastUtterance: utterances[utterances.length - 1]?.transcript
    });

    const overallFeedback = generateOverallFeedback(scores, sentiment);
    const observation = generateObservation(utterances, topics, sentiment);

    console.log('Final Output:', {
      overallFeedback,
      observation,
      rawTranscript: transcript.substring(0, 200) + '...' // First 200 chars
    });

    // Format the response as clean JSON
    const responseData = {
      scores,
      overallFeedback,
      observation,
      parameters: parameters.map(p => ({
        name: p.name,
        weight: p.weight,
        description: p.desc,
        type: p.inputType
      }))
    };

    return NextResponse.json(responseData, {
      headers: {
        'Content-Type': 'application/json',
      }
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
  const greetingKeywords = ['नमस्ते', 'हैलो', 'गुड मॉर्निंग', 'गुड आफ्टरनून', 'गुड इवनिंग', 'स्वागत है'];
  const hasGreeting = greetingKeywords.some(keyword => 
    firstUtterance.transcript.toLowerCase().includes(keyword)
  );
  console.log('Greeting Analysis:', {
    firstUtterance: firstUtterance.transcript,
    startTime: firstUtterance.start,
    hasGreeting,
    matchedKeywords: greetingKeywords.filter(keyword => 
      firstUtterance.transcript.toLowerCase().includes(keyword)
    )
  });
  return hasGreeting && firstUtterance.start <= 3 ? 5 : 0;
}

function analyzeUrgency(utterances: Utterance[]): number {
  const urgencyKeywords = ['जरूरी', 'तुरंत', 'असप', 'क्रिटिकल', 'महत्वपूर्ण', 'डेडलाइन', 'ड्यू डेट', 'पेमेंट ड्यू', 'लेट पेमेंट', 'ओवरड्यू'];
  const urgencyScore = utterances.reduce((score, utterance) => {
    const text = utterance.transcript.toLowerCase();
    const hasUrgency = urgencyKeywords.some(keyword => text.includes(keyword));
    const hasQuestioning = text.includes('?') && (text.includes('कब') || text.includes('क्यों') || text.includes('कैसे'));
    const hasTimeReference = text.includes('आज') || text.includes('कल') || text.includes('इस हफ्ते') || text.includes('इस महीने');
    
    if (hasUrgency || hasQuestioning || hasTimeReference) {
      console.log('Urgency Analysis:', {
        text,
        hasUrgency,
        hasQuestioning,
        hasTimeReference,
        matchedKeywords: urgencyKeywords.filter(keyword => text.includes(keyword))
      });
    }
    return score + (hasUrgency ? 2 : 0) + (hasQuestioning ? 1 : 0) + (hasTimeReference ? 1 : 0);
  }, 0);
  return Math.min(15, Math.max(0, urgencyScore - 2));
}

function analyzeRebuttal(utterances: Utterance[]): number {
  const objectionKeywords = ['नहीं कर सकते', 'नहीं होगा', 'नहीं', 'संभव नहीं', 'बहुत महंगा', 'अफोर्ड नहीं', 'मुश्किल', 'समस्या', 'चिंता', 'परेशान'];
  const rebuttalKeywords = ['समझते हैं', 'लेकिन', 'परंतु', 'वैकल्पिक', 'समाधान', 'मदद', 'सहायता', 'सपोर्ट', 'ऑफर', 'विकल्प', 'सुझाव'];
  
  let objectionCount = 0;
  let rebuttalCount = 0;
  let lastObjectionIndex = -1;
  
  utterances.forEach((utterance, index) => {
    const text = utterance.transcript.toLowerCase();
    const hasObjection = objectionKeywords.some(keyword => text.includes(keyword));
    const hasRebuttal = rebuttalKeywords.some(keyword => text.includes(keyword));
    
    if (hasObjection) {
      objectionCount++;
      lastObjectionIndex = index;
      console.log('Objection Analysis:', {
        text,
        matchedKeywords: objectionKeywords.filter(keyword => text.includes(keyword))
      });
    }
    if (hasRebuttal && index > lastObjectionIndex) {
      rebuttalCount++;
      console.log('Rebuttal Analysis:', {
        text,
        matchedKeywords: rebuttalKeywords.filter(keyword => text.includes(keyword))
      });
    }
  });
  
  const score = Math.min(15, (objectionCount * 2) + (rebuttalCount * 3));
  return objectionCount > 0 ? Math.min(15, Math.max(0, score - (objectionCount - rebuttalCount) * 2)) : 0;
}

function analyzeEtiquette(sentiment: Sentiment): number {
  console.log('Etiquette Analysis:', { sentiment });
  const baseScore = 8; // Reduced base score
  const sentimentScore = sentiment.sentiment_score > 0.3 ? 7 : 
                        sentiment.sentiment_score > 0 ? 3 :
                        sentiment.sentiment_score > -0.3 ? -3 : -7;
  return Math.max(0, Math.min(15, baseScore + sentimentScore));
}

function analyzeDisclaimer(utterances: Utterance[]): number {
  const disclaimerKeywords = ['रिकॉर्डिंग', 'रिकॉर्ड', 'टेप', 'मॉनिटरिंग', 'कॉल रिकॉर्ड हो रहा है', 'क्वालिटी के लिए', 'ट्रेनिंग के लिए'];
  const earlyDisclaimer = utterances.some(utterance => 
    utterance.start <= 30 && disclaimerKeywords.some(keyword => 
      utterance.transcript.toLowerCase().includes(keyword)
    )
  );
  return earlyDisclaimer ? 5 : 0;
}

function analyzeDisposition(utterances: Utterance[], intents: Intent[]): number {
  console.log('Disposition Analysis:', { intents });
  const dispositionKeywords = ['श्रेणी', 'प्रकार', 'कारण', 'उद्देश्य', 'डिस्पोजिशन', 'वर्गीकरण', 'समाधान'];
  const hasDisposition = utterances.some(utterance => {
    const text = utterance.transcript.toLowerCase();
    return dispositionKeywords.some(keyword => text.includes(keyword));
  }) || intents.some(intent => 
    intent.intent.toLowerCase().includes('disposition') || 
    intent.intent.toLowerCase().includes('category')
  );
  const hasSpecificDisposition = utterances.some(utterance => {
    const text = utterance.transcript.toLowerCase();
    return dispositionKeywords.some(keyword => text.includes(keyword)) && 
           (text.includes('क्योंकि') || text.includes('कारण') || text.includes('वजह'));
  });
  return hasSpecificDisposition ? 10 : (hasDisposition ? 5 : 0);
}

function analyzeClosing(utterances: Utterance[]): number {
  if (!utterances.length) return 0;
  const lastUtterance = utterances[utterances.length - 1];
  const closingKeywords = ['धन्यवाद', 'शुक्रिया', 'आभार', 'अलविदा', 'बाय', 'शुभ दिन', 'ख्याल रखना', 'अच्छा दिन'];
  const hasClosing = closingKeywords.some(keyword => 
    lastUtterance.transcript.toLowerCase().includes(keyword)
  );
  const hasPoliteClosing = hasClosing && 
    (lastUtterance.transcript.toLowerCase().includes('धन्यवाद') || 
     lastUtterance.transcript.toLowerCase().includes('शुक्रिया'));
  if (hasPoliteClosing) {
    console.log('Polite closing found in:', lastUtterance.transcript);
  }
  return hasPoliteClosing ? 5 : 0;
}

function analyzeIdentification(utterances: Utterance[]): number {
  const idKeywords = ['नाम', 'आईडी', 'अकाउंट', 'ग्राहक', 'रेफरेंस', 'अकाउंट नंबर', 'ग्राहक आईडी', 'पहचान'];
  const earlyIdentification = utterances.some(utterance => 
    utterance.start <= 60 && idKeywords.some(keyword => 
      utterance.transcript.toLowerCase().includes(keyword)
    )
  );
  return earlyIdentification ? 5 : 0;
}

function analyzeTapeDisclosure(utterances: Utterance[]): number {
  const disclosureKeywords = ['रिकॉर्डिंग', 'रिकॉर्ड', 'टेप', 'मॉनिटरिंग', 'कॉल रिकॉर्ड हो रहा है', 'क्वालिटी के लिए', 'ट्रेनिंग के लिए'];
  const earlyDisclosure = utterances.some(utterance => 
    utterance.start <= 30 && disclosureKeywords.some(keyword => 
      utterance.transcript.toLowerCase().includes(keyword)
    )
  );
  return earlyDisclosure ? 10 : 0;
}

function analyzeToneLanguage(sentiment: Sentiment, utterances: Utterance[]): number {
  console.log('Tone Analysis:', { sentiment });
  const negativeKeywords = ['गाली', 'धमकी', 'गुस्सा', 'अभद्र', 'बेवकूफ', 'बेकार', 'बुरा', 'भयानक', 'सबसे खराब'];
  const hasNegativeLanguage = utterances.some(utterance => {
    const text = utterance.transcript.toLowerCase();
    const found = negativeKeywords.some(keyword => text.includes(keyword));
    if (found) {
      console.log('Negative language found in:', text);
    }
    return found;
  });
  
  if (hasNegativeLanguage || sentiment.sentiment_score < -0.3) {
    return 0;
  } else if (sentiment.sentiment_score < -0.1) {
    return 5;
  } else if (sentiment.sentiment_score < 0.1) {
    return 10;
  }
  return 15;
}

function generateOverallFeedback(scores: Record<string, number>, sentiment: Sentiment): string {
  // Build feedback based on key performance areas
  const feedbackParts = [];
  
  // Check for major strengths
  if (scores.collectionUrgency >= 12) {
    feedbackParts.push("The agent was effective in creating urgency");
  }
  if (scores.rebuttalCustomerHandling >= 12) {
    feedbackParts.push("handled objections professionally");
  }
  if (scores.callEtiquette >= 12) {
    feedbackParts.push("maintained excellent call etiquette");
  }
  
  // Check for major issues
  if (scores.callDisclaimer === 0) {
    feedbackParts.push("failed to provide disclaimer");
  }
  if (scores.fatalTapeDiscloser === 0) {
    feedbackParts.push("missed tape disclosure");
  }
  if (scores.fatalIdentification === 0) {
    feedbackParts.push("failed to verify customer identity");
  }
  
  // Add sentiment-based feedback
  if (sentiment.sentiment_score > 0.3) {
    feedbackParts.push("maintained a positive tone throughout");
  } else if (sentiment.sentiment_score < -0.3) {
    feedbackParts.push("struggled with maintaining a positive tone");
  }
  
  // Combine feedback parts
  let feedback = "The agent ";
  if (feedbackParts.length > 0) {
    feedback += feedbackParts.join(", ");
  } else {
    feedback += "performed adequately but has room for improvement";
  }
  
  return feedback;
}

function generateObservation(utterances: Utterance[], topics: Topic[], sentiment: Sentiment): string {
  const observations = [];
  
  // Analyze objections and handling
  const objectionKeywords = ['नहीं कर सकते', 'नहीं होगा', 'नहीं', 'संभव नहीं', 'बहुत महंगा', 'अफोर्ड नहीं', 'मुश्किल', 'समस्या', 'चिंता', 'परेशान'];
  const rebuttalKeywords = ['समझते हैं', 'लेकिन', 'परंतु', 'वैकल्पिक', 'समाधान', 'मदद', 'सहायता', 'सपोर्ट', 'ऑफर', 'विकल्प', 'सुझाव'];
  
  let hasObjections = false;
  let hasRebuttals = false;
  const objectionTopics = new Set<string>();
  
  utterances.forEach(utterance => {
    const text = utterance.transcript.toLowerCase();
    if (objectionKeywords.some(keyword => text.includes(keyword))) {
      hasObjections = true;
      // Try to identify the topic of objection
      if (text.includes('पेनल्टी') || text.includes('जुर्माना')) {
        objectionTopics.add('penalty');
      }
      if (text.includes('पेमेंट') || text.includes('भुगतान')) {
        objectionTopics.add('payment');
      }
      if (text.includes('समय') || text.includes('टाइम')) {
        objectionTopics.add('time');
      }
    }
    if (rebuttalKeywords.some(keyword => text.includes(keyword))) {
      hasRebuttals = true;
    }
  });

  // Build observation about objections
  if (hasObjections) {
    const topicList = Array.from(objectionTopics);
    if (topicList.length > 0) {
      if (hasRebuttals) {
        observations.push(`Customer raised objections about ${topicList.join(' and ')}. Agent managed well`);
      } else {
        observations.push(`Customer raised objections about ${topicList.join(' and ')}. Agent could have handled better`);
      }
    } else {
      if (hasRebuttals) {
        observations.push("Customer raised objections which were handled professionally");
      } else {
        observations.push("Customer raised objections that could have been handled better");
      }
    }
  }

  // Check for tape disclosure
  const disclosureKeywords = ['रिकॉर्डिंग', 'रिकॉर्ड', 'टेप', 'मॉनिटरिंग', 'कॉल रिकॉर्ड हो रहा है', 'क्वालिटी के लिए', 'ट्रेनिंग के लिए'];
  const hasDisclosure = utterances.some(utterance => 
    disclosureKeywords.some(keyword => utterance.transcript.toLowerCase().includes(keyword))
  );
  if (!hasDisclosure) {
    observations.push("Agent missed tape disclosure");
  }

  // Check for identification
  const idKeywords = ['नाम', 'आईडी', 'अकाउंट', 'ग्राहक', 'रेफरेंस', 'अकाउंट नंबर', 'ग्राहक आईडी', 'पहचान'];
  const hasIdentification = utterances.some(utterance => 
    idKeywords.some(keyword => utterance.transcript.toLowerCase().includes(keyword))
  );
  if (!hasIdentification) {
    observations.push("Customer identification was not properly verified");
  }

  // Analyze main topics and sentiment
  if (topics.length > 0) {
    const mainTopics = topics
      .sort((a, b) => b.confidence_score - a.confidence_score)
      .slice(0, 2)
      .map(t => t.topic);
    
    if (mainTopics.length > 0) {
      const topicContext = mainTopics.join(' and ');
      if (sentiment.sentiment_score > 0.3) {
        observations.push(`Positive discussion about ${topicContext}`);
      } else if (sentiment.sentiment_score < -0.3) {
        observations.push(`Difficult conversation regarding ${topicContext}`);
      } else {
        observations.push(`Discussed ${topicContext}`);
      }
    }
  }

  // Check for proper closing
  const lastUtterance = utterances[utterances.length - 1];
  const closingKeywords = ['धन्यवाद', 'शुक्रिया', 'आभार', 'अलविदा', 'बाय', 'शुभ दिन', 'ख्याल रखना', 'अच्छा दिन'];
  const hasProperClosing = lastUtterance && closingKeywords.some(keyword => 
    lastUtterance.transcript.toLowerCase().includes(keyword)
  );
  if (!hasProperClosing) {
    observations.push("Call ended without proper closing");
  }

  return observations.join('. ') || "No specific observations available.";
} 