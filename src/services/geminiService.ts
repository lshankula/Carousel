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
  consistentTheme?: boolean;
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

    // Remove "Slide X:", "**Slide X**", "Slide X -", "[Slide X]", "1. Slide 1.", etc. from the beginning of the content
    const cleanContent = block.replace(/^\s*(?:\[|\(|\d+\.\s*)?(?:\*\*)?Slide\s*\d+(?:\*\*)?(?:\]|\))?\s*[:\-.]?\s*/i, '').trim();

    return {
      id: Math.random().toString(36).substr(2, 9),
      content: cleanContent,
      type
    };
  }).slice(0, 20); // Limit to 20 slides
}

export async function generateSlideImage(slide: SlideContent, config: CarouselConfig, index: number, totalSlides: number, headshot?: string | null): Promise<string> {
  
  // Define a diverse set of themes to ensure visual variety across the carousel
  const themes = [
    `Dark, bold, and immersive theme based heavily on the Brand Background color (${config.backgroundColor}).`,
    `Light, clean, and elegant theme (white or very light tint of the Brand Background) with dark text for high contrast.`,
    `Vibrant and energetic theme featuring the Primary Brand Color (${config.primaryColor}) prominently as the background or major accent.`,
    `Soft, premium gradient theme blending the Background color and Secondary color seamlessly.`,
    `Minimalist "editorial" theme with massive negative space and stark, high-contrast typography.`,
    `Rich, textured theme with subtle geometric patterns, grain, or noise overlaying the Brand Background color.`
  ];

  // Define a diverse set of layout structures
  const layouts = [
    `Center-aligned, perfectly symmetrical layout for immediate impact.`,
    `Left-aligned text with a strong vertical accent line or structural element on the left edge.`,
    `Asymmetric layout with text anchored to the bottom-left and balancing visual elements in the top-right.`,
    `Framed layout with a distinct, elegant, thin border around the content area.`,
    `Split-screen illusion layout where the background is divided diagonally or vertically by two brand colors.`,
    `Floating card layout where the main text is inside a subtle, slightly transparent box.`
  ];

  // Use a combination of index and total slides to deterministically pick a unique style combo for each slide
  // If consistentTheme is true, lock the index to 0 for all slides so they share the exact same theme and layout
  const styleIndex = config.consistentTheme ? 0 : index;
  const themeInstruction = themes[styleIndex % themes.length];
  const layoutInstruction = layouts[(styleIndex * 2) % layouts.length]; // Offset to mix and match themes with layouts

  let typeSpecificInstructions = "";
  if (slide.type === 'cover') {
    typeSpecificInstructions = `Create a highly engaging, scroll-stopping cover design. Use large, dramatic typography for the title. Include background elements or textures that perfectly match the requested "${config.style}" style.`;
  } else if (slide.type === 'quote') {
    typeSpecificInstructions = `Design an elegant quote card. Use a large, stylized quotation mark as a background element. Center the quote with beautiful, readable typography. Keep the background textured but perfectly aligned with the "${config.style}" style.`;
  } else if (slide.type === 'cta') {
    typeSpecificInstructions = `Create a bold, high-conversion Call to Action slide. Make the core message massive and impossible to ignore. Use the Primary brand color prominently to draw the eye, while strictly maintaining the "${config.style}" style.`;
  } else {
    typeSpecificInstructions = `Create a visually rich content slide. DO NOT just put plain text on a solid background. Incorporate visual elements, framing, or textures that perfectly match the requested "${config.style}" style to add visual depth. Ensure the layout feels like a premium magazine spread.`;
  }

  const aspectRatioName = config.format.includes('1:1') ? "1:1 Square" : config.format.includes('4:5') ? "4:5 Vertical (Portrait)" : "9:16 Vertical (Stories/Reels)";

  // Translate user selections into strong, actionable prompt directives
  let styleDirective = "";
  switch (config.style) {
    case 'Aesthetic': styleDirective = "Trendy, soft, visually pleasing with smooth gradients, organic shapes, and a modern 'vibe'."; break;
    case 'Brutalist': styleDirective = "Raw, high-contrast, unapologetic, with harsh lines, oversized typography, and a rebellious, edgy feel."; break;
    case 'Minimal': styleDirective = "Extremely clean, massive negative space, stripping away all non-essential elements. Less is more."; break;
    case 'Editorial': styleDirective = "Like a high-end fashion magazine spread, sophisticated layouts, elegant typography, and striking composition."; break;
    default: styleDirective = "Corporate, trustworthy, clean, highly polished, and professional."; break;
  }

  let fontDirective = "";
  switch (config.fontStyle) {
    case 'Serif Elegant': fontDirective = "Sophisticated, high-end serif typography (like Garamond or Playfair Display) for a luxurious, classic feel."; break;
    case 'Modern Sans': fontDirective = "Bold, geometric, contemporary sans-serif typography (like Helvetica or Futura) for a striking, forward-looking look."; break;
    case 'Tech Mono': fontDirective = "Monospace or technical typography (like JetBrains Mono or Courier) for a developer, coding, or tech-focused aesthetic."; break;
    default: fontDirective = "Clean, modern, highly legible sans-serif typography."; break;
  }

  let platformDirective = "";
  switch (config.platform) {
    case 'LinkedIn': platformDirective = "Optimized for LinkedIn: professional, authoritative, and focused on clear business value."; break;
    case 'Twitter/X': platformDirective = "Optimized for X (Twitter): punchy, bold, and designed to stop the scroll instantly."; break;
    case 'TikTok': platformDirective = "Optimized for TikTok: high-energy, trendy, and visually loud."; break;
    default: platformDirective = "Optimized for Instagram: highly visual, aesthetic, and engaging."; break;
  }

  let prompt = `Generate an image of a high-quality, professionally designed social media carousel slide.
  
  CORE IDENTITY:
  - Platform Vibe: ${platformDirective}
  - Overall Aesthetic Style: ${styleDirective}
  - Typography Style: ${fontDirective}
  - Aspect Ratio: ${aspectRatioName}
  
  SLIDE CONTENT:
  Slide Type: ${slide.type}.
  Content: ${slide.content}.
  ${slide.title && !slide.title.toLowerCase().includes('slide') ? `Title: ${slide.title}` : ''}
  ${slide.subtitle ? `Subtitle: ${slide.subtitle}` : ''}
  
  Brand Colors:
  - Primary: ${config.primaryColor}
  - Secondary: ${config.secondaryColor}
  - Background: ${config.backgroundColor}
  
  Design Requirements: 
  - Generate a visually striking layout that STRICTLY adheres to the "${config.style}" aesthetic requested above.
  - ${typeSpecificInstructions}
  - Ensure the text is highly legible and well-composed within the image.
  - Use the brand colors creatively to establish a strong visual identity across the slide.
  
  CREATIVE DIRECTION FOR THIS SPECIFIC SLIDE:
  - Color & Theme Balance: ${themeInstruction}
  - Layout & Structure: ${layoutInstruction}
  
  CRITICAL INSTRUCTIONS: 
  1. DO NOT include any AI cliches, brains, glowing nodes, robots, cyborgs, or generic futuristic tech slop. Keep it human, professional, and grounded.
  2. FILL THE ENTIRE CANVAS: The design, background color, and textures MUST extend edge-to-edge across the entire image. DO NOT create a square design with white borders or uncolored padding at the top or bottom.
  3. Keep the bottom 20% of the image free of text to maintain a clean visual hierarchy. This area MUST be filled with the background design, but contain absolutely NO text, NO logos, NO icons, NO faces, NO avatars, and NO UI elements.
  4. DO NOT write "Slide 1", "Slide 2", or any slide numbers huge at the top. The numbering is implied.
  5. DO NOT generate or insert any random logos, profile pictures, avatars, or headshots ANYWHERE in the image.
  6. Do not include any fake social media UI elements (like hearts, comment bubbles, or share icons).
  7. DO NOT write or display the actual hex color codes (e.g., #FFFFFF, ${config.primaryColor}) anywhere in the image text. Use the colors for styling, but never write the hex code strings.`;

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
      // Create a new instance right before the call to use the latest API key and ensure a fresh state for retries
      const aiInstance = new GoogleGenAI({ apiKey: process.env.API_KEY || process.env.GEMINI_API_KEY || '' });
      
      // Slightly modify the prompt on retries to bypass persistent 500 errors
      // caused by specific prompt hashes or edge-case content combinations
      const currentParts = [...parts];
      if (attempt > 0) {
        const textPartIndex = currentParts.findIndex(p => p.text !== undefined);
        if (textPartIndex !== -1) {
          currentParts[textPartIndex] = { 
            text: currentParts[textPartIndex].text + `\n\n[Retry variation ${attempt}: Ensure high quality and adherence to brand guidelines.]` 
          };
        }
      }

      // Fallback to older model on the last attempt if it's a persistent error
      const useFallbackModel = attempt === maxAttempts - 1;
      const modelToUse = useFallbackModel ? 'gemini-2.5-flash-image' : 'gemini-3.1-flash-image-preview';
      
      const imageConfig: any = {
        aspectRatio: config.format.includes('1:1') ? "1:1" : config.format.includes('4:5') ? "3:4" : "9:16",
      };
      
      // Only 3.1 supports imageSize
      if (!useFallbackModel) {
        imageConfig.imageSize = "1K";
      }

      const response = await aiInstance.models.generateContent({
        model: modelToUse,
        contents: {
          parts: currentParts,
        },
        config: {
          imageConfig: imageConfig
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
      
      // Check if it's a retryable error (we retry on almost everything except auth/bad request)
      const errorMsg = error?.message || '';
      const errorName = error?.name || '';
      const errorStr = (typeof error === 'object' ? JSON.stringify(error, Object.getOwnPropertyNames(error)) : String(error)).toUpperCase();
      
      const combinedErrorStr = `${errorStr} ${errorMsg} ${errorName}`.toUpperCase();
      
      const isAuthError = error?.status === 401 || error?.status === 403 || combinedErrorStr.includes('API_KEY_INVALID') || combinedErrorStr.includes('PERMISSION_DENIED');
      const isBadRequest = error?.status === 400 || combinedErrorStr.includes('INVALID_ARGUMENT');
      
      // Retry on anything that isn't explicitly an auth or bad request error
      const isRetryable = !isAuthError && !isBadRequest;
                          
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

export async function editSlideImage(originalImageBase64: string, editPrompt: string): Promise<string> {
  // Extract base64 data and mime type
  const match = originalImageBase64.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid image format. Expected base64 data URI.");
  }

  const mimeType = match[1];
  const base64Data = match[2];

  let attempt = 0;
  const maxAttempts = 3;
  let lastError: any = null;

  while (attempt < maxAttempts) {
    try {
      const aiInstance = new GoogleGenAI({ apiKey: process.env.API_KEY || process.env.GEMINI_API_KEY || '' });
      
      const response = await aiInstance.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType,
              },
            },
            {
              text: editPrompt,
            },
          ],
        },
      });

      const candidate = response.candidates?.[0];
      if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
        throw new Error(`Image edit stopped with reason: ${candidate.finishReason}`);
      }

      for (const part of candidate?.content?.parts || []) {
        if (part.inlineData) {
          const outMimeType = part.inlineData.mimeType || 'image/png';
          return `data:${outMimeType};base64,${part.inlineData.data}`;
        }
      }
      throw new Error("No image data returned from edit operation.");
    } catch (error: any) {
      lastError = error;
      const combinedErrorStr = `${error?.name} ${error?.message} ${JSON.stringify(error)}`.toUpperCase();
      const isAuthError = error?.status === 401 || error?.status === 403 || combinedErrorStr.includes('API_KEY_INVALID') || combinedErrorStr.includes('PERMISSION_DENIED');
      const isBadRequest = error?.status === 400 || combinedErrorStr.includes('INVALID_ARGUMENT');
      
      const isRetryable = !isAuthError && !isBadRequest;
      if (isRetryable && attempt < maxAttempts - 1) {
        const delay = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        attempt++;
      } else {
        break;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
