import { GoogleGenAI, Type } from "@google/genai";

export interface SlideContent {
  id: string;
  content: string;
  type: 'cover' | 'content' | 'quote' | 'cta';
  title?: string;
  subtitle?: string;
}

export interface CarouselConfig {
  platform: string;
  format: string;
  style: string;
  fontStyle: string;
  headshot?: string;
  headshotPosition: 'first' | 'all';
  logo?: string;
  logoPosition: 'first' | 'all';
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
}

export async function parseSlides(rawText: string): Promise<SlideContent[]> {
  // Fast local parsing (0ms) instead of AI call (2-5s) to ensure exact text matching and instant results
  
  // Split by double newlines
  let blocks = rawText.split(/\n\n+/).filter(s => s.trim());
  
  // If it didn't split well (e.g., single newlines), try splitting by "Slide X"
  if (blocks.length === 1 && /Slide \d+/i.test(rawText)) {
    blocks = rawText.split(/(?=Slide \d+)/i).filter(s => s.trim());
  }

  return blocks.map((block, index) => {
    let type: 'cover' | 'content' | 'quote' | 'cta' = 'content';
    
    const lowerBlock = block.toLowerCase();
    
    // Heuristics for slide type
    if (index === 0 || lowerBlock.includes('(hook)')) {
      type = 'cover';
    } else if (
      index === blocks.length - 1 || 
      lowerBlock.includes('(cta)') || 
      lowerBlock.includes('comment "') ||
      lowerBlock.includes('link in bio')
    ) {
      type = 'cta';
    } else if (lowerBlock.includes('quote')) {
      type = 'quote';
    }

    return {
      id: Math.random().toString(36).substr(2, 9),
      content: block.trim(),
      type
    };
  }).slice(0, 20); // Limit to 20 slides
}

export async function generateSlideImage(slide: SlideContent, config: CarouselConfig, index: number, totalSlides: number, headshot?: string | null): Promise<string> {
  // Create a new instance right before the call to use the latest API key
  const aiInstance = new GoogleGenAI({ apiKey: process.env.API_KEY || process.env.GEMINI_API_KEY || '' });
  
  // Determine if this slide should be light or dark to create visual rhythm
  const themeInstruction = index % 2 === 0 
    ? `Use a dark, bold, and immersive theme based on the Brand Background color (${config.backgroundColor}).` 
    : `Use a light, clean, and elegant theme (white or very light tint of the Brand Background) with dark text for high contrast.`;

  let typeSpecificInstructions = "";
  if (slide.type === 'cover') {
    typeSpecificInstructions = "Create a highly engaging, scroll-stopping cover design. Use large, dramatic typography for the title. Include dynamic abstract shapes or a subtle premium texture in the background.";
  } else if (slide.type === 'quote') {
    typeSpecificInstructions = "Design an elegant quote card. Use a large, stylized quotation mark as a background element. Center the quote with beautiful, readable typography. Keep the background minimal but textured.";
  } else if (slide.type === 'cta') {
    typeSpecificInstructions = "Create a bold, high-conversion Call to Action slide. Make the core message massive and impossible to ignore. Use the Primary brand color prominently to draw the eye.";
  } else {
    typeSpecificInstructions = "Create a visually rich content slide. DO NOT just put plain text on a solid background. Incorporate elegant geometric shapes, subtle gradients, or modern abstract patterns using the brand colors to frame the text and add visual depth. Ensure the layout feels like a premium magazine spread.";
  }

  const aspectRatioName = config.format.includes('1:1') ? "1:1 Square" : config.format.includes('4:5') ? "4:5 Vertical (Portrait)" : "9:16 Vertical (Stories/Reels)";

  let prompt = `Generate an image of a high-quality, professionally designed social media carousel slide for ${config.platform}.
  Aspect Ratio: ${aspectRatioName}
  Style: ${config.style}. 
  Slide Type: ${slide.type}.
  Content: ${slide.content}.
  ${slide.title && !slide.title.toLowerCase().includes('slide') ? `Title: ${slide.title}` : ''}
  ${slide.subtitle ? `Subtitle: ${slide.subtitle}` : ''}
  
  Brand Colors:
  - Primary: ${config.primaryColor}
  - Secondary: ${config.secondaryColor}
  - Background: ${config.backgroundColor}
  
  Design Requirements: 
  - Generate a visually striking, premium layout with beautiful typography and clean spacing.
  - ${typeSpecificInstructions}
  - Ensure the text is highly legible and well-composed within the image.
  - Use the brand colors creatively to establish a strong visual identity across the slide.
  
  THEME RHYTHM: ${themeInstruction}
  
  CRITICAL INSTRUCTIONS: 
  1. DO NOT include any AI cliches, brains, glowing nodes, robots, cyborgs, or generic futuristic tech slop. Keep it human, professional, and grounded.
  2. FILL THE ENTIRE CANVAS: The design, background color, and textures MUST extend edge-to-edge across the entire image. DO NOT create a square design with white borders or uncolored padding at the top or bottom.
  3. Keep the bottom 20% of the image free of text to maintain a clean visual hierarchy. This area MUST be filled with the background design, but contain absolutely NO text, NO logos, NO icons, NO faces, NO avatars, and NO UI elements.
  4. DO NOT write "Slide 1", "Slide 2", or any slide numbers huge at the top. The numbering is implied.
  5. DO NOT generate or insert any random logos, profile pictures, avatars, or headshots ANYWHERE in the image.
  6. Do not include any fake social media UI elements (like hearts, comment bubbles, or share icons).`;

  const parts: any[] = [{ text: prompt }];

  if (headshot && index === 0 && (config.headshotPosition === 'all' || config.headshotPosition === 'first')) {
    prompt += `\n\n5. I have provided a headshot image. Please remove its background and seamlessly integrate the person into the design of this slide so it flows naturally with the content.`;
    parts[0].text = prompt;
    
    // Extract base64 data and mime type
    const match = headshot.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (match) {
      parts.unshift({
        inlineData: {
          mimeType: match[1],
          data: match[2]
        }
      });
    }
  }

  let attempt = 0;
  const maxAttempts = 4;
  let lastError: any = null;

  while (attempt < maxAttempts) {
    try {
      const response = await aiInstance.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: {
          parts: parts,
        },
        config: {
          imageConfig: {
            aspectRatio: config.format.includes('1:1') ? "1:1" : config.format.includes('4:5') ? "3:4" : "9:16",
            imageSize: "1K"
          }
        }
      });

      const candidate = response.candidates?.[0];
      if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
        throw new Error(`Image generation stopped with reason: ${candidate.finishReason}`);
      }

      let textResponse = "";
      for (const part of candidate?.content?.parts || []) {
        if (part.inlineData) {
          const mimeType = part.inlineData.mimeType || 'image/png';
          return `data:${mimeType};base64,${part.inlineData.data}`;
        } else if (part.text) {
          textResponse += part.text + "\n";
          console.log("Received text instead of image:", part.text);
        }
      }
      console.log("Full response:", JSON.stringify(response, null, 2));
      throw new Error(`No image data returned. Model said: ${textResponse || 'No text provided'}`);
    } catch (error: any) {
      lastError = error;
      
      // Check if it's a 503 error, 429 rate limit, or 500 internal error
      const errorStr = typeof error === 'object' ? JSON.stringify(error) : String(error);
      const isRetryable = error?.status === 503 || error?.status === 429 || error?.status === 500 ||
                          errorStr.includes('503') || errorStr.includes('429') || errorStr.includes('500') ||
                          errorStr.includes('UNAVAILABLE') || errorStr.includes('high demand') || errorStr.includes('INTERNAL') ||
                          error?.message?.includes('503') || error?.message?.includes('429') || error?.message?.includes('500') ||
                          error?.message?.includes('UNAVAILABLE') || error?.message?.includes('high demand') || error?.message?.includes('INTERNAL');
                          
      if (isRetryable && attempt < maxAttempts - 1) {
        console.warn(`Image generation failed (attempt ${attempt + 1}/${maxAttempts}). Retrying...`, error);
        // Exponential backoff: 2s, 4s, 8s...
        const delay = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
        console.log(`Retrying in ${Math.round(delay/1000)}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        attempt++;
      } else {
        console.error(`Image generation failed permanently after ${attempt + 1} attempts`, error);
        break;
      }
    }
  }

  // If we get here, all attempts failed
  if (lastError instanceof Error) {
    throw lastError;
  } else if (typeof lastError === 'object' && lastError !== null) {
    throw new Error(JSON.stringify(lastError));
  } else {
    throw new Error(String(lastError));
  }
}
