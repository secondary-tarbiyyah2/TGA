// Tarbiyyah Global Academy, entry assessment content bank (English).
// Hand-written, original content. British English throughout.
// Pure TypeScript, no imports: runs in Deno and Node (--experimental-strip-types).
//
// `level` = national-curriculum year (1–11) at which a typical pupil answers
// correctly roughly 60–70% of the time. Decimals allowed.
// Bands: 1 = Y1–2, 2 = Y3–4, 3 = Y5–6, 4 = Y7–9, 5 = Y10–11. A passage may
// narrow its band with `years` (Year 1 has its own, much shorter, texts).
//
// Content rules (the list is BANNED in curriculum.ts, checked by
// scripts/assess-selftest.ts): any religious content must be accurate and
// uncontroversial for a mainstream Sunni school, the banned references must
// never appear, and texts must suit the youngest year that reads them.

export type Band = 1 | 2 | 3 | 4 | 5;
export type Skill = "retrieval" | "inference" | "vocabulary" | "sequence" | "purpose" | "language";
export type PassageQuestion = { q: string; choices: [string, string, string, string]; answer: 0 | 1 | 2 | 3; skill: Skill; level: number };
export type Passage = { id: string; band: Band; years?: [number, number]; title: string; kind: "fiction" | "non-fiction" | "poem"; text: string; questions: PassageQuestion[] };

export type Mcq = { stem: string; choices: [string, string, string, string]; answer: 0 | 1 | 2 | 3; level: number; objective: string };
export type Spelling = { correct: string; wrong: [string, string, string]; level: number };
export type WordItem = { word: string; answer: string; distractors: [string, string, string]; level: number };
export type Analogy = { a: string; b: string; c: string; answer: string; distractors: [string, string, string]; level: number };
export type OddOne = { options: [string, string, string, string, string]; answer: 0 | 1 | 2 | 3 | 4; reason: string; level: number };
export type Phonics = { say: string; choices: [string, string, string, string]; answer: 0 | 1 | 2 | 3; level: number };
export type WritingPrompt = { id: string; band: Band; title: string; prompt: string; purpose: string; audience: string; minutes: number; guide: string };

// ---------------------------------------------------------------------------
// READING PASSAGES
// ---------------------------------------------------------------------------

export const PASSAGES: Passage[] = [
  // ----- Band 1: Year 1 (very short; read to the child as well) -----
  // From the Tarbiyyah Primary Year 1 admissions entry test (Questions 7 and 8), owner, 11 Nov 2026.
  {
    id: "y1-ant-grasshopper",
    band: 1,
    years: [1, 2],
    title: "Ant and Grasshopper",
    kind: "fiction",
    text: [
      "It was summer. The sun was hot.",
      "Ant got berries to keep for winter.",
      "“Get ready for winter,” said Ant. “I need food for my kids.”",
      "But Grasshopper went to sleep in the sun.",
    ].join("\n\n"),
    questions: [
      { q: "What was the weather like?", choices: ["sunny", "cloudy", "rainy", "snowy"], answer: 0, skill: "retrieval", level: 1.0 },
      { q: "What did Ant get?", choices: ["leaves", "berries", "sticks", "stones"], answer: 1, skill: "retrieval", level: 1.2 },
      { q: "Why did Ant need food?", choices: ["for his dinner", "for his kids", "for later that day", "for Grasshopper"], answer: 1, skill: "retrieval", level: 1.5 },
      { q: "What did Grasshopper do?", choices: ["got food", "went to sleep", "helped Ant", "went home"], answer: 1, skill: "retrieval", level: 1.6 },
    ],
  },
  {
    id: "y1-big-box",
    band: 1,
    years: [1, 1],
    title: "The Big Box",
    kind: "fiction",
    text: [
      "Musa has a big box. He gets in it.",
      "“It is a ship!” said Musa.",
      "Then Mum came in. “Where is Musa?” she said.",
      "Musa popped up. “Here I am!”",
      "Mum got in too. Now it is a ship for two.",
    ].join("\n\n"),
    questions: [
      { q: "What does Musa have?", choices: ["a big box", "a red hat", "a toy ship", "a cat"], answer: 0, skill: "retrieval", level: 1.0 },
      { q: "What does Musa say the box is?", choices: ["a car", "a house", "a ship", "a bed"], answer: 2, skill: "retrieval", level: 1.2 },
      { q: "Who came in?", choices: ["Dad", "Mum", "Gran", "a cat"], answer: 1, skill: "retrieval", level: 1.3 },
      { q: "How do you think Musa feels?", choices: ["sad", "cross", "scared", "happy"], answer: 3, skill: "inference", level: 1.8 },
    ],
  },
  {
    id: "y1-ducks",
    band: 1,
    years: [1, 1],
    title: "Ducks",
    kind: "non-fiction",
    text: [
      "A duck is a bird. It has two legs and two wings.",
      "A duck can swim. Its big flat feet help it swim fast.",
      "A duck can fly too.",
      "Ducks eat plants and bugs. They live on ponds and rivers.",
      "A baby duck is a duckling.",
    ].join("\n\n"),
    questions: [
      { q: "How many legs does a duck have?", choices: ["one", "two", "four", "six"], answer: 1, skill: "retrieval", level: 1.0 },
      { q: "What helps a duck swim fast?", choices: ["its wings", "its tail", "its feet", "its beak"], answer: 2, skill: "retrieval", level: 1.4 },
      { q: "What is a baby duck?", choices: ["a duckling", "a chick", "a puppy", "a kitten"], answer: 0, skill: "vocabulary", level: 1.5 },
      { q: "Where do ducks live?", choices: ["in caves", "in the sand", "in trees", "on ponds and rivers"], answer: 3, skill: "retrieval", level: 1.7 },
    ],
  },

  // ----- Band 1: Year 2 -----
  {
    id: "b1-red-hat",
    band: 1,
    years: [2, 2],
    title: "Amina's Red Hat",
    kind: "fiction",
    text: [
      "Amina has a red hat. She likes it a lot.",
      "One day, Amina and Dad went to the park. It was very windy. The wind got under the hat. Up it went!",
      "The hat flew over the pond. It landed on a duck. The duck did not like it. It flapped and quacked. Then the hat fell on the grass.",
      "Amina ran to get it. “Thank you, duck!” she said. Dad laughed and laughed.",
      "Amina held her hat tight all the way home.",
    ].join("\n\n"),
    questions: [
      { q: "What colour is Amina's hat?", choices: ["blue", "red", "green", "yellow"], answer: 1, skill: "retrieval", level: 1.0 },
      { q: "Who went to the park with Amina?", choices: ["Mum", "her brother", "Dad", "Gran"], answer: 2, skill: "retrieval", level: 1.2 },
      { q: "Where did the hat land first?", choices: ["on a duck", "in the pond", "on a tree", "on the grass"], answer: 0, skill: "retrieval", level: 1.8 },
      { q: "Why did Amina hold her hat tight all the way home?", choices: ["She was cold.", "Dad told her to.", "The duck wanted it back.", "She did not want the wind to blow it away again."], answer: 3, skill: "inference", level: 2.5 },
    ],
  },
  {
    id: "b1-busy-bees",
    band: 1,
    years: [2, 2],
    title: "Busy Bees",
    kind: "non-fiction",
    text: [
      "Bees are small insects. A bee has six legs and four wings. Lots of bees are black and yellow.",
      "Bees fly from flower to flower. They drink a sweet juice called nectar. They take it back to the hive. In the hive, the bees turn the nectar into honey.",
      "A hive has lots of bees in it. One bee is the queen. She lays all the eggs.",
      "Bees help plants too. They carry pollen from one flower to the next. This helps fruit to grow.",
    ].join("\n\n"),
    questions: [
      { q: "How many wings does a bee have?", choices: ["two", "six", "four", "eight"], answer: 2, skill: "retrieval", level: 1.2 },
      { q: "What is the sweet juice that bees drink called?", choices: ["nectar", "milk", "pollen", "honey"], answer: 0, skill: "retrieval", level: 1.6 },
      { q: "Which bee lays the eggs?", choices: ["the king", "the queen", "the biggest worker", "the baby bee"], answer: 1, skill: "retrieval", level: 1.8 },
      { q: "Why is a farmer glad to see bees?", choices: ["Bees help the fruit to grow.", "Bees eat the weeds.", "Bees make the farm noisy.", "Bees keep the birds away."], answer: 0, skill: "inference", level: 2.5 },
    ],
  },

  // ----- Band 2 (Years 3–4) -----
  {
    id: "b2-spice-stall",
    band: 2,
    title: "Yusuf's Busy Morning",
    kind: "fiction",
    text: [
      "Every Saturday, Yusuf helped his grandmother at her spice stall in the old market of Fes. The stall was tiny, but it was crammed with baskets of orange turmeric, red paprika and dusty green mint.",
      "This Saturday, Grandmother had a cold. “You will have to do the talking today,” she croaked, wrapping her scarf around her throat.",
      "Yusuf's stomach fluttered. He knew every spice by its smell, but he had never served a customer on his own.",
      "The first customer was a tall man with a notebook. “I need something warm and sweet for a cake,” he said.",
      "Yusuf thought hard. Then he held out a small jar. “Cinnamon,” he said. “My grandmother puts it in her almond biscuits.”",
      "The man sniffed the jar and smiled. “Perfect. I'll take two bags.”",
      "By midday, Yusuf had sold cumin to a chef, saffron to a bride's mother and a whole basket of mint to a café owner. His voice no longer shook when he spoke.",
      "As they packed up, Grandmother pressed a warm coin into his hand. “You have a spice merchant's nose,” she whispered, “and now you have a spice merchant's voice too.”",
    ].join("\n\n"),
    questions: [
      { q: "Where was Grandmother's spice stall?", choices: ["in a café in Fes", "in the old market of Fes", "outside Yusuf's school", "in a shop in Rabat"], answer: 1, skill: "retrieval", level: 2.8 },
      { q: "Why did Yusuf's stomach flutter?", choices: ["He was hungry.", "He had caught Grandmother's cold.", "He was nervous about serving customers on his own.", "He did not like the smell of the spices."], answer: 2, skill: "inference", level: 3.5 },
      { q: "The stall was 'crammed with baskets'. What does 'crammed' mean?", choices: ["packed full", "painted brightly", "kept tidy", "nearly empty"], answer: 0, skill: "vocabulary", level: 3.5 },
      { q: "Who was Yusuf's first customer?", choices: ["a chef", "a café owner", "a bride's mother", "a tall man who wanted to bake a cake"], answer: 3, skill: "sequence", level: 3.2 },
      { q: "'His voice no longer shook when he spoke.' What does this tell us about Yusuf?", choices: ["He had lost his voice.", "He was becoming more confident.", "He was tired of talking.", "He had stopped speaking to customers."], answer: 1, skill: "inference", level: 4.2 },
      { q: "What does Grandmother mean when she says Yusuf now has 'a spice merchant's voice'?", choices: ["He can sing loudly in the market.", "He sounds just like his grandmother.", "He can now talk to customers with confidence.", "He has caught a cold from the spice dust."], answer: 2, skill: "language", level: 4.8 },
    ],
  },
  {
    id: "b2-camels",
    band: 2,
    title: "Ships of the Desert",
    kind: "non-fiction",
    text: [
      "Camels are often called the ships of the desert. For thousands of years, people have used them to carry goods across hot, sandy places such as the Sahara in North Africa and the deserts of Arabia.",
      "Many people think a camel's hump is full of water. In fact, it is mostly fat. When food is hard to find, the camel's body can use this fat for energy. If a camel goes without food for a long time, its hump becomes smaller and may even flop over to one side.",
      "Camels can survive for many days without drinking. When they do find water, they can drink an enormous amount very quickly.",
      "Their bodies suit desert life in other ways too. Two rows of long eyelashes protect their eyes from blowing sand. They can close their nostrils during a sandstorm. Their wide, padded feet spread out on soft sand, so they do not sink.",
      "Today, camels are still important to many families. They provide milk, wool and transport. Some people even race them! It is easy to see why these patient, hard-working animals are so highly valued.",
    ].join("\n\n"),
    questions: [
      { q: "What is a camel's hump mostly made of?", choices: ["fat", "water", "muscle", "bone"], answer: 0, skill: "retrieval", level: 2.8 },
      { q: "'They can drink an enormous amount.' What does 'enormous' mean?", choices: ["tiny", "sudden", "very large", "cold"], answer: 2, skill: "vocabulary", level: 3.2 },
      { q: "Why might a camel's hump flop over to one side?", choices: ["The camel has drunk too much water.", "The camel has used up much of its stored fat.", "The camel is getting ready to race.", "The camel has been sitting in the wind."], answer: 1, skill: "inference", level: 4.0 },
      { q: "How do camels stop sand getting into their eyes?", choices: ["They close their nostrils.", "They have wide, padded feet.", "They have two rows of long eyelashes.", "They turn their backs to the wind."], answer: 2, skill: "retrieval", level: 3.5 },
      { q: "How does the writer feel about camels?", choices: ["bored", "frightened", "annoyed", "admiring"], answer: 3, skill: "inference", level: 4.5 },
      { q: "Why does the writer say 'Many people think a camel's hump is full of water'?", choices: ["to correct a common mistake", "to tell a joke about camels", "to show that the writer is unsure", "to persuade readers to buy a camel"], answer: 0, skill: "purpose", level: 4.6 },
    ],
  },

  // ----- Band 3 (Years 5–6) -----
  {
    id: "b3-wadi-rum",
    band: 3,
    title: "Stars over Wadi Rum",
    kind: "fiction",
    text: [
      "The jeep bumped to a stop beside a wall of red rock, and the engine fell silent. For a moment, Layla could hear nothing at all: no traffic, no televisions, no neighbours' doors – just a silence so deep it seemed to ring in her ears.",
      "“Welcome to Wadi Rum,” said Uncle Khalid. “Tonight, the desert is our hotel.”",
      "Layla and her younger brother, Idris, helped him lay out thick rugs on the sand while the sky turned from orange to violet. Idris kept glancing at the shadows between the rocks. “Are there scorpions?” he asked.",
      "“They prefer to stay hidden,” Uncle Khalid replied. “And we'll keep our boots zipped inside the tent.” Idris looked only slightly reassured.",
      "After they had eaten bread and lentil soup warmed on a small fire, Uncle Khalid covered the glowing embers with sand. “Now,” he said, “lie on your backs and wait.”",
      "At first, Layla saw only a handful of stars. Then, as her eyes adjusted, more and more appeared, until the sky was dusted with thousands of them, thick as spilt sugar.",
      "“Long ago, Arab astronomers gave names to many of these stars,” said Uncle Khalid. “Travellers used them to find their way across the desert at night.” He pointed to a bright orange star. “That one is Aldebaran – ‘the follower’ – because it seems to follow a little cluster of stars across the sky.”",
      "Idris had stopped thinking about scorpions. He was counting stars under his breath and losing count every few seconds.",
      "Layla smiled. In the city, the night sky had always seemed empty. She had never realised how much it had been hiding.",
    ].join("\n\n"),
    questions: [
      { q: "What does the star name 'Aldebaran' mean?", choices: ["the traveller", "the follower", "the bright one", "the leader"], answer: 1, skill: "retrieval", level: 4.5 },
      { q: "Which of these happened first?", choices: ["Idris counted the stars.", "They ate bread and lentil soup.", "They laid out rugs on the sand.", "Uncle Khalid covered the embers with sand."], answer: 2, skill: "sequence", level: 4.8 },
      { q: "'Idris looked only slightly reassured.' What does this tell us about Idris?", choices: ["was still a little worried about scorpions", "had completely forgotten about scorpions", "wanted to go and look for scorpions", "thought his uncle was joking"], answer: 0, skill: "inference", level: 5.5 },
      { q: "'As her eyes adjusted, more and more appeared.' Here, 'adjusted' means…", choices: ["became tired", "filled with tears", "closed slowly", "got used to the darkness"], answer: 3, skill: "vocabulary", level: 5.5 },
      { q: "Why did Uncle Khalid cover the fire's embers before they looked up?", choices: ["to save the wood for breakfast", "because the soup was finished", "so that the sky would look darker and the stars brighter", "to keep the scorpions away"], answer: 2, skill: "inference", level: 6.2 },
      { q: "The stars were 'thick as spilt sugar'. What does this suggest?", choices: ["The stars looked sticky and sweet.", "There were countless tiny, bright points crowded together.", "The stars were falling towards the ground.", "The sky was white rather than dark."], answer: 1, skill: "language", level: 6.8 },
    ],
  },
  {
    id: "b3-al-jazari",
    band: 3,
    title: "Al-Jazari: The Engineer of Wonders",
    kind: "non-fiction",
    text: [
      "More than eight hundred years ago, an engineer named Ismail al-Jazari lived in the city of Diyarbakır, in what is now Turkey. He worked for the rulers of the region. His job was to build machines that were useful and seemed almost magical.",
      "In 1206, al-Jazari finished a book about his inventions. It describes about fifty machines. For each one, he drew careful diagrams and wrote step-by-step instructions, so that other engineers could build it too. This was unusual at the time, because many inventors kept their methods secret.",
      "One of his most famous creations was the elephant clock. Inside a model elephant, a bowl with a tiny hole sat in a tank of water. Slowly, the bowl filled and sank. As it sank, it pulled on strings. Every half hour, this set off a chain of movements: a ball dropped, a bird whistled and a figure struck a cymbal.",
      "Al-Jazari also designed machines for raising water from rivers and wells. Farmers in dry places needed a steady supply of water for their crops, and lifting it by hand was exhausting work. Some of his machines used a crank. A crank is a part that changes a turning movement into a back-and-forth movement. Many later machines used the same idea.",
      "Today, engineers and historians still study his book. Model makers have rebuilt several of his machines from his drawings. Some people call al-Jazari one of the fathers of robotics, because his moving figures worked by themselves.",
      "His work shows that great inventions often come from careful watching, patience and a little playfulness.",
    ].join("\n\n"),
    questions: [
      { q: "In which year did al-Jazari complete his book of inventions?", choices: ["1026", "1602", "1260", "1206"], answer: 3, skill: "retrieval", level: 4.5 },
      { q: "Sharing instructions 'was unusual at the time'. What does this suggest about al-Jazari?", choices: ["He wanted other engineers to learn from his work.", "He did not care whether his machines worked.", "He was worried about his secrets being stolen.", "He could not draw very well."], answer: 0, skill: "inference", level: 5.5 },
      { q: "'Lifting it by hand was exhausting work.' What does 'exhausting' mean?", choices: ["exciting", "very tiring", "dangerous", "quick"], answer: 1, skill: "vocabulary", level: 5.0 },
      { q: "How did the elephant clock show that half an hour had passed?", choices: ["A number appeared on the elephant's side.", "A bowl rose to the top of the tank.", "A chain of movements and sounds took place.", "A person rang a bell inside the elephant."], answer: 2, skill: "retrieval", level: 5.2 },
      { q: "Why does the writer describe al-Jazari's machines as 'almost magical'?", choices: ["They were made by magicians.", "They moved and made sounds by themselves in surprising ways.", "They were too small to see.", "They only worked at night."], answer: 1, skill: "inference", level: 6.0 },
      { q: "Why does the writer explain what a crank is?", choices: ["to show that cranks were first used in Turkey", "to argue that cranks are better than engines", "to describe how al-Jazari spent his free time", "to help the reader understand a technical word"], answer: 3, skill: "purpose", level: 6.5 },
    ],
  },

  // ----- Band 4 (Years 7–9) -----
  {
    id: "b4-black-sea-fog",
    band: 4,
    title: "Fog on the Black Sea",
    kind: "fiction",
    text: [
      "Elif had been begging to go out on Dede's boat since she was seven. Now, at twelve, she was finally sitting in the bow of the little blue fishing boat, watching the town of Rize shrink behind her.",
      "The morning was bright and still. Gulls trailed the boat in lazy circles, and the tea plantations on the hills looked like rows of green corduroy. Dede hummed as he checked the nets, his hands moving with the confidence of fifty years' practice.",
      "It was Elif who noticed the change first. A thin grey line had appeared on the horizon, like a pencil mark someone had forgotten to rub out. Within twenty minutes, the line had thickened into a wall, and the wall was rolling towards them.",
      "“Fog,” said Dede, and stopped humming.",
      "When it reached them, the world simply vanished. The hills disappeared, then the gulls, then the far end of the boat. Every sound seemed oddly close and oddly muffled at the same time, as though the sea had been wrapped in cotton wool.",
      "Elif's heart began to race. “How will we find the harbour?”",
      "Dede cut the engine to a low murmur, took a battered brass compass from his pocket and laid it on the bench between them. “The sea hasn't moved,” he said calmly. “Only our eyes have stopped working. So we use other things.” He tapped the compass, then cupped a hand to his ear.",
      "They sat in silence. At last, faint and low, came a long note from somewhere ahead and slightly to the left: the harbour horn.",
      "For the next hour, they crept forward, Dede adjusting the tiller a fraction at a time, Elif calling out each time she heard the horn. Then, quite suddenly, the dark shape of the harbour wall loomed out of the greyness.",
      "That evening, over glasses of strong black tea, her mother asked whether she had been frightened.",
      "Elif considered the question. “At first,” she admitted. “But Dede wasn't. And after a while, I realised that being scared and being lost aren't the same thing.”",
    ].join("\n\n"),
    questions: [
      { q: "What did Dede take out of his pocket when the fog arrived?", choices: ["a torch", "a brass compass", "a map", "a whistle"], answer: 1, skill: "retrieval", level: 6.0 },
      { q: "'“Fog,” said Dede, and stopped humming.' What does this suggest?", choices: ["Dede was taking the situation seriously.", "Dede was angry with Elif for noticing the fog first.", "Dede had forgotten the words of his song.", "Dede was pleased that the fog had arrived."], answer: 0, skill: "inference", level: 7.0 },
      { q: "'The dark shape of the harbour wall loomed out of the greyness.' Here, 'loomed' means…", choices: ["disappeared quickly", "appeared as a large, unclear shape", "fell down suddenly", "shone brightly"], answer: 1, skill: "vocabulary", level: 7.5 },
      { q: "The writer says it was 'as though the sea had been wrapped in cotton wool'. What is the main effect of this simile?", choices: ["It shows that the sea had turned white.", "It suggests the boat felt safe and comfortable.", "It conveys how soft and muffled the sounds had become.", "It shows that the water was very cold."], answer: 2, skill: "language", level: 7.5 },
      { q: "The writer describes the hills, then the gulls, then the far end of the boat disappearing. Why are they listed in this order?", choices: ["to show how quickly Elif forgot what she had seen", "to describe the view from the harbour", "to explain why Dede needed his compass", "to show the fog closing in nearer and nearer, building tension"], answer: 3, skill: "language", level: 8.5 },
      { q: "At the end, Elif says that 'being scared and being lost aren't the same thing'. What has she learned?", choices: ["that she should never go out on a boat again", "that feeling afraid does not stop you finding your way if you stay calm", "that Dede had never really been at sea before", "that fog is less dangerous than it looks"], answer: 1, skill: "inference", level: 9.0 },
    ],
  },
  {
    id: "b4-school-gardens",
    band: 4,
    title: "Every School Needs a Garden",
    kind: "non-fiction",
    text: [
      "Picture a typical school playground: tarmac, painted lines, perhaps a bench or two. Now picture the same space with raised beds of tomatoes, a row of sunflowers taller than the Year 7s and a small pond buzzing with dragonflies. Which school would you rather attend?",
      "Across the country, schools are turning unused corners into gardens, and the results are hard to ignore. Pupils who grow vegetables are often more willing to try eating them. A child who has watered a lettuce for six weeks is far more curious about how it tastes than one who meets it, limp and unannounced, on a dinner plate.",
      "Gardens are also outdoor classrooms. Measuring the growth of bean plants is maths. Investigating why some seeds sprout and others do not is science. Writing a guide to looking after the school's chickens is English. Lessons that might feel abstract indoors suddenly have a purpose when there is soil under your fingernails.",
      "Then there is wellbeing. Many teachers notice that pupils who struggle to sit still in a classroom become calm and focused when given a job outside. Gardening is slow, gentle work; it rewards care rather than speed. In a world of instant notifications, that is a valuable lesson in itself.",
      "Critics argue that gardens are expensive and that teachers are already too busy. These are fair concerns, but they are not impossible to solve. A garden does not need to be large: a few planters made from recycled pallets can be enough to start. Parents, grandparents and local gardening clubs are often delighted to volunteer, and seeds cost very little.",
      "Perhaps the strongest argument is the simplest. A school garden gives every pupil, whatever their background, a chance to dig, plant, wait and harvest – and to discover that some of the best things in life cannot be hurried.",
      "So the next time your school council meets, raise your hand and ask one question: where could our garden grow?",
    ].join("\n\n"),
    questions: [
      { q: "What is the main purpose of this article?", choices: ["to explain how to grow tomatoes", "to describe one particular school's garden", "to persuade readers that schools should have gardens", "to argue that playgrounds should be removed"], answer: 2, skill: "purpose", level: 6.5 },
      { q: "Why does the writer begin by asking the reader to 'Picture' two playgrounds?", choices: ["to help the reader imagine and compare them, making the garden seem more appealing", "to show that the writer has visited many schools", "to give instructions for drawing a playground", "to prove that gardens are cheaper than playgrounds"], answer: 0, skill: "language", level: 7.0 },
      { q: "According to the writer, what could be used to make cheap planters?", choices: ["old tyres", "recycled pallets", "plastic bottles", "broken desks"], answer: 1, skill: "retrieval", level: 6.2 },
      { q: "'Lessons that might feel abstract indoors.' In this context, 'abstract' means…", choices: ["colourful and artistic", "short and simple", "noisy and crowded", "hard to connect to real, practical experience"], answer: 3, skill: "vocabulary", level: 8.0 },
      { q: "The writer describes a lettuce arriving 'limp and unannounced, on a dinner plate'. What does this suggest?", choices: ["Children are less interested in food they have no connection with.", "School dinners are always cooked badly.", "Lettuce should not be served at school.", "Children prefer growing lettuce to eating it."], answer: 0, skill: "inference", level: 8.0 },
      { q: "What does the writer imply with the phrase 'In a world of instant notifications'?", choices: ["Pupils should not be allowed phones at school.", "Modern life often encourages impatience.", "Gardening apps are useful for pupils.", "Teachers send parents too many messages."], answer: 1, skill: "inference", level: 8.8 },
    ],
  },

  // ----- Band 5 (Years 10–11) -----
  {
    id: "b5-crystals",
    band: 5,
    title: "The Geometry of Growth",
    kind: "fiction",
    text: [
      "Bilal's crystals refused to grow.",
      "For three weeks, the beaker had sat on the windowsill of the school laboratory, between a dusty skeleton model and a spider plant that nobody admitted to owning. Every lunchtime, Bilal had peered into the cloudy blue solution as though it might be persuaded by attention alone. And every lunchtime, the thread dangling into the liquid had remained stubbornly, insultingly bare.",
      "Across the bench, Priya's beaker looked like a jeweller's window. Sapphire-coloured crystals, sharp-edged and glittering, crowded along her thread.",
      "“Maybe yours is just shy,” she offered.",
      "Bilal did not laugh. The science fair was on Friday, and his display board – carefully titled The Geometry of Growth – contained a hypothesis, a method and a large, accusing gap where the results should have been.",
      "That evening he spread his notes across the kitchen table. His mother, marking a pile of her own pupils' essays, watched him over her glasses as he flicked through the pages with growing irritation.",
      "“Tell me what you did,” she said eventually. “Not what went wrong. What you did.”",
      "So he told her: how he had dissolved the copper sulfate in hot water, stirred until no more would dissolve, let it cool and suspended the thread. She listened without interrupting, then asked a single question.",
      "“Where did Priya get her water?”",
      "Bilal opened his mouth and found that he did not know. He had used the tap by the fume cupboard. Priya, he now remembered, had used distilled water from the prep room, because – she had said at the time, though he had barely listened – it would have fewer impurities.",
      "It was not a guaranteed explanation. Crystal growth could be ruined by a dozen things: dust, vibration, a solution that was not quite saturated. But it was a question, and a question was something he could test.",
      "On Friday, his board still boasted no crystals. Instead, Bilal had added a new section in thick black pen: What Went Wrong – and How I Would Find Out. He listed every variable he could think of and described a fair test for each.",
      "The judge, a retired chemist with a cardigan and a fierce stare, read the whole board twice. “Most projects here tell me what happened,” she said. “Yours tells me how to think.”",
      "Bilal did not win first prize. Priya did, and deserved it. But on the way out, he noticed that the judge had written a single word beside his name and underlined it twice: scientist.",
    ].join("\n\n"),
    questions: [
      { q: "Where did Bilal get the water for his solution?", choices: ["from the prep room", "from a bottle he brought from home", "from the tap by the fume cupboard", "from Priya's beaker"], answer: 2, skill: "retrieval", level: 8.5 },
      { q: "The thread is described as 'stubbornly, insultingly bare'. What is the effect of these adverbs?", choices: ["They make the thread seem to be deliberately defying Bilal, showing his frustration.", "They show that the thread was made of poor-quality material.", "They suggest that Priya had damaged Bilal's experiment.", "They make the scene sound calm and peaceful."], answer: 0, skill: "language", level: 9.0 },
      { q: "Why does Bilal's mother say, 'Not what went wrong. What you did'?", choices: ["She is not interested in his project.", "She wants him to set aside his frustration and focus on the facts of his method.", "She suspects he has made up his results.", "She wants him to admit that Priya is cleverer."], answer: 1, skill: "inference", level: 9.5 },
      { q: "'A solution that was not quite saturated.' In this context, 'saturated' means…", choices: ["soaked with rainwater", "completely frozen", "too hot to touch", "holding as much dissolved substance as it can"], answer: 3, skill: "vocabulary", level: 9.0 },
      { q: "Why does the writer begin with the one-line paragraph 'Bilal's crystals refused to grow.'?", choices: ["to show that the story is set in a garden", "to suggest that Bilal is lazy", "to establish the central problem immediately and hook the reader", "to explain the science of crystal growth"], answer: 2, skill: "language", level: 10.0 },
      { q: "Why might the judge have written and underlined the word 'scientist' beside Bilal's name?", choices: ["She thought he had copied Priya's work.", "She recognised that his way of thinking was genuinely scientific, even without results.", "She planned to give him first prize.", "She was noting a spelling mistake on his board."], answer: 1, skill: "inference", level: 10.5 },
    ],
  },
  {
    id: "b5-thames",
    band: 5,
    title: "The River That Came Back",
    kind: "non-fiction",
    text: [
      "In the summer of 1858, London held its breath. For decades, the city's waste had poured straight into the River Thames, and a long heatwave turned the water into a stinking soup. Newspapers called it the Great Stink. Curtains soaked in chemicals were hung at the windows of the Houses of Parliament, but the smell still seeped through.",
      "The crisis forced the government to act. The engineer Joseph Bazalgette designed a vast new network of sewers to carry waste away from the centre of the city and out towards the sea. It included more than a thousand miles of street sewers feeding into great brick tunnels, many of them built by hand. It was one of the greatest engineering achievements of its age, and much of it is still in use today.",
      "Yet the river's troubles were far from over. As London kept growing, so did the waste. Factories along the banks released chemicals, and sewage works damaged during the Second World War were slow to be repaired. By the 1950s, the water in central London held so little oxygen that scientists from the Natural History Museum declared the tidal Thames biologically dead.",
      "What happened next surprised almost everyone. New treatment works were built, factories were required to clean their waste, and laws were tightened. Slowly, oxygen returned to the water, and wildlife followed. Today, more than a hundred species of fish have been recorded in the tidal Thames, along with seals, porpoises and even seahorses.",
      "The recovery is not complete. After heavy rain, the old Victorian sewers can still overflow into the river, carrying untreated sewage with them. A new “super sewer” has been built beneath the river to catch most of this overflow. Plastic waste and wet wipes remain a stubborn problem.",
      "The story of the Thames offers a lesson that reaches far beyond one river. Damage that took a century to cause cannot be undone overnight, but nor is it necessarily permanent. When people understand a problem, are willing to pay for the solution and keep working at it for many years, even a river once declared dead can come back to life.",
    ].join("\n\n"),
    questions: [
      { q: "What is the writer's main purpose?", choices: ["to explain how to build a sewer", "to tell how a polluted river recovered, and what we can learn from it", "to persuade readers to swim in the Thames", "to describe the life of Joseph Bazalgette"], answer: 1, skill: "purpose", level: 9.0 },
      { q: "In the 1950s, what did scientists say about the tidal Thames?", choices: ["It was too cold for fish.", "It was the cleanest river in Europe.", "It was 'biologically dead'.", "It was full of seahorses."], answer: 2, skill: "retrieval", level: 8.5 },
      { q: "'The smell still seeped through.' Here, 'seeped' means…", choices: ["flowed slowly through small gaps", "disappeared completely", "was blown away by the wind", "became much stronger"], answer: 0, skill: "vocabulary", level: 9.0 },
      { q: "Why does the writer begin with the Great Stink of 1858?", choices: ["to show that London still smells today", "to explain how the curtains were made", "to prove that Victorian engineers were careless", "to open with a vivid moment that shows how bad the problem was"], answer: 3, skill: "language", level: 9.5 },
      { q: "Why does the writer say the recovery 'is not complete'?", choices: ["The fish have left the river again.", "Sewers can still overflow after heavy rain, and plastic is still a problem.", "The new sewer was never finished.", "The seals are eating all the fish."], answer: 1, skill: "inference", level: 10.0 },
      { q: "What does the final paragraph suggest?", choices: ["Rivers always recover without any help.", "The Thames is now completely clean.", "Long-term effort, and a willingness to pay, can repair serious damage.", "Pollution only matters in big cities."], answer: 2, skill: "inference", level: 10.8 },
    ],
  },
];

// ---------------------------------------------------------------------------
// GRAMMAR AND PUNCTUATION (80 items, Years 1–9)
// ---------------------------------------------------------------------------

export const GRAMMAR: Mcq[] = [
  // Year 1
  { stem: "Which sentence is punctuated correctly?", choices: ["the cat sat on the mat.", "The cat sat on the mat.", "The cat sat on the mat", "the Cat sat on the mat."], answer: 1, level: 1.0, objective: "Y1 capital letter and full stop" },
  { stem: "Which sentence needs a question mark at the end?", choices: ["I like apples", "The sun is hot", "We went to the park", "Where is my bag"], answer: 3, level: 1.2, objective: "Y1 question marks" },
  { stem: "In 'we met sara at the park', which word must always start with a capital letter?", choices: ["met", "sara", "park", "at"], answer: 1, level: 1.3, objective: "Y1 capital letters for names" },
  { stem: "I have a pen ____ a pencil.", choices: ["and", "but", "the", "is"], answer: 0, level: 1.0, objective: "Y1 joining words with and" },
  { stem: "Which word means more than one?", choices: ["cat", "dog", "foxes", "bus"], answer: 2, level: 1.4, objective: "Y1 plural -s and -es" },
  { stem: "Which sentence should end with an exclamation mark?", choices: ["What a huge cake that is", "Is it raining", "I have a red coat", "Can you swim"], answer: 0, level: 1.6, objective: "Y1 exclamation marks" },
  { stem: "Yesterday we ____ on the trampoline.", choices: ["jump", "jumped", "jumping", "jumps"], answer: 1, level: 1.5, objective: "Y1 suffix -ed for past tense" },
  // From the Tarbiyyah Primary Year 1 admissions entry test (Questions 1 to 3), owner, 11 Nov 2026.
  { stem: "'My friend alex lives here.' Which word needs a capital letter?", choices: ["friend", "alex", "lives", "door"], answer: 1, level: 1.3, objective: "Y1 capital letters for names" },
  { stem: "Which sentence should end with a question mark?", choices: ["I like apples", "Do you like apples", "Apples are red", "We ate apples"], answer: 1, level: 1.2, objective: "Y1 question marks" },
  { stem: "I gave my sister an Eid present ____ she liked it.", choices: ["and", "if", "or", "the"], answer: 0, level: 1.4, objective: "Y1 joining words with and" },
  { stem: "Which sentence uses a capital letter for 'I' correctly?", choices: ["mum and I went out.", "Mum and i went out.", "Mum and I Went out.", "Mum and I went out."], answer: 3, level: 1.2, objective: "Y1 capital letter for I" },

  // Year 2
  { stem: "Which sentence is in the past tense?", choices: ["I am eating lunch.", "I ate my lunch.", "I will eat lunch.", "I eat lunch every day."], answer: 1, level: 2.0, objective: "Y2 past tense" },
  { stem: "We ____ playing football when it started to rain.", choices: ["is", "be", "were", "was"], answer: 2, level: 2.3, objective: "Y2 progressive form of verbs" },
  { stem: "Which sentence is a command?", choices: ["The door is shut.", "What a big door!", "Can you shut the door?", "Shut the door, please."], answer: 3, level: 2.2, objective: "Y2 sentence types: command" },
  { stem: "Which sentence uses commas correctly in a list?", choices: ["I bought eggs, milk, bread and jam.", "I bought eggs milk, bread, and, jam.", "I bought, eggs milk bread and jam.", "I bought eggs, milk bread, and jam."], answer: 0, level: 2.4, objective: "Y2 commas in a list" },
  { stem: "Which word is an adjective? 'The fluffy kitten slept.'", choices: ["The", "fluffy", "kitten", "slept"], answer: 1, level: 2.0, objective: "Y2 adjectives in noun phrases" },
  { stem: "Which is the correct short form of 'do not'?", choices: ["do'nt", "dont'", "don't", "d'ont"], answer: 2, level: 2.2, objective: "Y2 apostrophe for contraction" },
  { stem: "Which shows a hat belonging to Sam?", choices: ["Sams hat", "Sams' hat", "Sam hat's", "Sam's hat"], answer: 3, level: 2.6, objective: "Y2 apostrophe for singular possession" },
  { stem: "I put on my coat ____ I was cold.", choices: ["or", "so", "because", "but"], answer: 2, level: 2.0, objective: "Y2 subordination with because" },
  { stem: "Which word is a noun? 'The happy girl ran quickly.'", choices: ["quickly", "ran", "happy", "girl"], answer: 3, level: 2.3, objective: "Y2 nouns" },

  // Year 3
  { stem: "I saw ____ owl in the tree.", choices: ["a", "an", "some", "much"], answer: 1, level: 3.0, objective: "Y3 a or an" },
  { stem: "Which sentence uses the present perfect form?", choices: ["She walks to school.", "She walked to school.", "She has walked to school.", "She is walking to school."], answer: 2, level: 3.6, objective: "Y3 present perfect" },
  { stem: "Which sentence uses inverted commas correctly?", choices: ["“Come here,” said Mum.", "“Come here, said Mum.”", "Come here, “said Mum.”", "“Come here” said, Mum."], answer: 0, level: 3.4, objective: "Y3 inverted commas for direct speech" },
  { stem: "Which word is a conjunction? 'We stayed inside when it started to snow.'", choices: ["stayed", "inside", "when", "snow"], answer: 2, level: 3.2, objective: "Y3 conjunctions: when" },
  { stem: "Which word is a preposition? 'The cat hid behind the shed.'", choices: ["behind", "cat", "hid", "shed"], answer: 0, level: 3.0, objective: "Y3 prepositions" },
  { stem: "Which word is an adverb? 'The fox crept silently through the woods.'", choices: ["fox", "woods", "crept", "silently"], answer: 3, level: 3.2, objective: "Y3 adverbs" },
  { stem: "Which word means the opposite of 'appear'?", choices: ["unappear", "disappear", "misappear", "inappear"], answer: 1, level: 3.0, objective: "Y3 prefixes dis-, un-, mis-, in-" },
  { stem: "Which word is in the same word family as 'sign'?", choices: ["sing", "signal", "sigh", "single"], answer: 1, level: 3.5, objective: "Y3 word families" },
  { stem: "I will go to the park ____ I have finished my homework.", choices: ["but", "or", "after", "so"], answer: 2, level: 3.3, objective: "Y3 conjunctions expressing time" },

  // Year 4
  { stem: "Which shows the bags belonging to several girls?", choices: ["the girl's bags", "the girls' bags", "the girls bag's", "the girls's bags"], answer: 1, level: 4.3, objective: "Y4 apostrophe for plural possession" },
  { stem: "Which sentence has a fronted adverbial punctuated correctly?", choices: ["Later that day we went, swimming.", "Later that day we, went swimming.", "Later that day, we went swimming.", "Later that, day we went swimming."], answer: 2, level: 4.0, objective: "Y4 comma after fronted adverbial" },
  { stem: "Which sentence is written in Standard English?", choices: ["We was late for school.", "We were late for school.", "I done my homework.", "They was happy."], answer: 1, level: 4.0, objective: "Y4 Standard English verb forms" },
  { stem: "Which group of words is an expanded noun phrase?", choices: ["ran very fast", "because it rained", "quickly and quietly", "the old wooden boat with a red sail"], answer: 3, level: 4.2, objective: "Y4 expanded noun phrases" },
  { stem: "Zara found a shell. ____ put it in her pocket.", choices: ["It", "Her", "They", "She"], answer: 3, level: 3.8, objective: "Y4 pronouns for cohesion" },
  { stem: "Which sentence is punctuated correctly?", choices: ["Omar asked, “Can I help?”", "Omar asked “Can I help”?", "Omar asked, “Can I help”?", "Omar asked, Can I help?”"], answer: 0, level: 4.5, objective: "Y4 punctuating direct speech" },
  { stem: "Which word is a determiner? 'Please pass me those apples.'", choices: ["pass", "me", "those", "apples"], answer: 2, level: 4.4, objective: "Y4 determiners" },
  { stem: "Which shows the coats belonging to the children?", choices: ["the childrens' coats", "the children's coats", "the childrens coats", "the children coat's"], answer: 1, level: 4.6, objective: "Y4 possession with irregular plurals" },
  { stem: "Yesterday, Bilal ____ his new trainers to school.", choices: ["weared", "worn", "wear", "wore"], answer: 3, level: 3.8, objective: "Y4 Standard English irregular past tense" },

  // Year 5
  { stem: "Which sentence contains a relative clause?", choices: ["The boy plays the violin every day.", "Because he practises, the boy plays well.", "The boy, who lives next door, plays the violin.", "The boy next door plays well."], answer: 2, level: 5.0, objective: "Y5 relative clauses" },
  { stem: "This is the bike ____ I won in the competition.", choices: ["who", "which", "whose", "whom"], answer: 1, level: 5.0, objective: "Y5 relative pronouns" },
  { stem: "Which modal verb shows the most certainty? 'It ____ rain tomorrow.'", choices: ["might", "could", "will", "may"], answer: 2, level: 5.2, objective: "Y5 modal verbs for degrees of possibility" },
  { stem: "Which sentence uses brackets for parenthesis correctly?", choices: ["My aunt who (is a doctor) lives in Leeds.", "My (aunt who is a doctor) lives in Leeds.", "My aunt who is (a doctor lives) in Leeds.", "My aunt (who is a doctor) lives in Leeds."], answer: 3, level: 5.3, objective: "Y5 brackets for parenthesis" },
  { stem: "Which word is an adverb of possibility?", choices: ["quickly", "perhaps", "yesterday", "loudly"], answer: 1, level: 5.0, objective: "Y5 adverbs of possibility" },
  { stem: "Which sentence uses dashes for parenthesis correctly?", choices: ["The castle – built in 1250 – stands on a hill.", "The castle built – in 1250 stands – on a hill.", "The – castle built in 1250 – stands on a hill.", "The castle built in 1250 stands on – a hill –."], answer: 0, level: 5.5, objective: "Y5 dashes for parenthesis" },
  { stem: "Which suffix turns the adjective 'simple' into a verb?", choices: ["-ness", "-ly", "-ify", "-ful"], answer: 2, level: 5.6, objective: "Y5 converting adjectives into verbs" },
  { stem: "Which sentence clearly invites Grandma to eat?", choices: ["Let's eat Grandma.", "Let's, eat Grandma.", "Lets eat Grandma,", "Let's eat, Grandma."], answer: 3, level: 5.4, objective: "Y5 commas to clarify meaning" },
  { stem: "Which adverbial would best open a new paragraph about what happened next?", choices: ["On the other hand,", "Later that week,", "In contrast,", "However,"], answer: 1, level: 5.2, objective: "Y5 cohesion across paragraphs using adverbials of time" },

  // Year 6
  { stem: "Which sentence is in the passive voice?", choices: ["The dog chased the ball.", "The dog is chasing the ball.", "The ball was chased by the dog.", "The dog had chased the ball."], answer: 2, level: 6.0, objective: "Y6 passive voice" },
  { stem: "Which sentence uses a semi-colon correctly?", choices: ["It was late; we went home.", "It was; late we went home.", "It was late we; went home.", "It; was late we went home."], answer: 0, level: 6.2, objective: "Y6 semi-colon between independent clauses" },
  { stem: "Which sentence uses a colon correctly?", choices: ["I packed: three things a torch, a map and a drink.", "I: packed three things, a torch, a map and a drink.", "I packed three things a torch: a map and a drink.", "I packed three things: a torch, a map and a drink."], answer: 3, level: 6.0, objective: "Y6 colon to introduce a list" },
  { stem: "Which sentence uses the subjunctive form?", choices: ["If I was you, I would apologise.", "If I were you, I would apologise.", "If I am you, I apologise.", "If I was being you, I would apologise."], answer: 1, level: 6.5, objective: "Y6 subjunctive" },
  { stem: "Which sentence is the most formal?", choices: ["Kids must not run in the corridor.", "Pupils must not run in the corridor.", "Don't run in the corridor, guys.", "No running in the corridor, okay?"], answer: 1, level: 6.0, objective: "Y6 formal vocabulary" },
  { stem: "Which sentence uses a hyphen to show that the shark eats people?", choices: ["The man eating-shark swam past.", "The-man eating shark swam past.", "The man-eating shark swam past.", "The man-eating-shark swam past."], answer: 2, level: 6.4, objective: "Y6 hyphens to avoid ambiguity" },
  { stem: "Which sentence contains a question tag?", choices: ["Are you coming?", "You are coming.", "Come with us!", "You're coming, aren't you?"], answer: 3, level: 6.2, objective: "Y6 question tags in informal speech" },
  { stem: "Which is the active version of 'The window was broken by Adam'?", choices: ["The window broke Adam.", "Adam broke the window.", "The window had been broken.", "Adam was broken by the window."], answer: 1, level: 6.3, objective: "Y6 active voice" },
  { stem: "Which word is a subordinating conjunction? 'Although it was cold, we swam in the sea.'", choices: ["Although", "cold", "swam", "sea"], answer: 0, level: 6.0, objective: "Y6 subordinate clauses and conjunctions" },

  // Year 7
  { stem: "Which is a complex sentence?", choices: ["The sun rose.", "The sun rose and the birds sang.", "When the sun rose, the birds began to sing.", "The sun rose. The birds sang."], answer: 2, level: 7.0, objective: "Y7 complex sentences" },
  { stem: "Which is a compound sentence?", choices: ["Although the pool was closed, we were happy.", "We wanted to swim, but the pool was closed.", "The pool, which was closed, looked empty.", "We swam."], answer: 1, level: 7.0, objective: "Y7 compound sentences" },
  { stem: "Which word is an abstract noun?", choices: ["table", "river", "teacher", "courage"], answer: 3, level: 6.8, objective: "Y7 abstract nouns" },
  { stem: "What is the subject of this sentence? 'After the storm, the old oak tree finally fell.'", choices: ["the storm", "the old oak tree", "finally", "fell"], answer: 1, level: 7.2, objective: "Y7 subject of a sentence" },
  { stem: "Which word is a pronoun? 'Nobody knew the answer.'", choices: ["Nobody", "knew", "the", "answer"], answer: 0, level: 7.3, objective: "Y7 indefinite pronouns" },
  { stem: "Which sentence is punctuated correctly?", choices: ["It was raining, we stayed in.", "It was, raining we stayed in.", "It was raining, so, we stayed in.", "It was raining; we stayed in."], answer: 3, level: 7.5, objective: "Y7 avoiding comma splices" },
  { stem: "The box of books ____ very heavy.", choices: ["are", "were", "is", "be"], answer: 2, level: 7.6, objective: "Y7 subject–verb agreement" },
  { stem: "Which sentence is correct?", choices: ["Their bringing there own lunch.", "There bringing they're own lunch.", "They're bringing their own lunch.", "They're bringing there own lunch."], answer: 2, level: 7.0, objective: "Y7 homophones: there, their, they're" },
  { stem: "Which tense is used in 'By next June, she will have finished her exams'?", choices: ["simple future", "future perfect", "present perfect", "past perfect"], answer: 1, level: 7.8, objective: "Y7 future perfect tense" },

  // Year 8
  { stem: "Which sentence uses a colon to introduce an explanation?", choices: ["There was only: one problem the road was closed.", "There was only one problem: the road was closed.", "There was only one: problem the road was closed.", "There: was only one problem the road was closed."], answer: 1, level: 8.0, objective: "Y8 colon to introduce an explanation" },
  { stem: "Which sentence uses semi-colons correctly in a complex list?", choices: ["We visited Rabat; Morocco, Tunis; Tunisia, and Cairo; Egypt.", "We visited; Rabat, Morocco, Tunis, Tunisia and Cairo, Egypt.", "We visited Rabat, Morocco; Tunis, Tunisia; and Cairo, Egypt.", "We visited Rabat, Morocco, Tunis; Tunisia; and Cairo, Egypt."], answer: 2, level: 8.5, objective: "Y8 semi-colons in complex lists" },
  { stem: "Which sentence contains a misplaced (dangling) modifier?", choices: ["Running for the bus, my bag fell open.", "Running for the bus, I dropped my bag.", "I dropped my bag while running for the bus.", "My bag fell open while I was running for the bus."], answer: 0, level: 8.8, objective: "Y8 misplaced modifiers" },
  { stem: "In 'She worked hard all afternoon', which word is used as an adverb?", choices: ["She", "worked", "hard", "afternoon"], answer: 2, level: 8.2, objective: "Y8 words that change word class" },
  { stem: "Which sentence uses the passive voice to hide who did the action?", choices: ["The head announced the results.", "The results were announced by the head.", "The head is announcing the results.", "The results were announced."], answer: 3, level: 8.3, objective: "Y8 agentless passive" },
  { stem: "Which sentence is most appropriate for a formal letter?", choices: ["I'm just dropping you a line to ask about stuff.", "I am writing to request further information.", "Hiya, can you tell me more?", "Gimme the info, please."], answer: 1, level: 7.5, objective: "Y8 formal register" },
  { stem: "Which sentence uses 'fewer' or 'less' correctly?", choices: ["There were less people than last year.", "There was fewer water in the jug.", "There were fewer people than last year.", "I have less sweets than you."], answer: 2, level: 8.0, objective: "Y8 fewer and less in Standard English" },
  { stem: "Neither of the answers ____ correct.", choices: ["are", "is", "be", "being"], answer: 1, level: 8.8, objective: "Y8 agreement with indefinite pronouns" },
  { stem: "Which sentence uses the past perfect?", choices: ["She left before we arrived.", "She has left already.", "She was leaving when we arrived.", "She had left before we arrived."], answer: 3, level: 8.0, objective: "Y8 past perfect" },

  // Year 9
  { stem: "Which sentence uses the subjunctive correctly?", choices: ["The teacher insisted that he arrives on time.", "The teacher insisted that he arrive on time.", "The teacher insists he is on time.", "The teacher said he arrived on time."], answer: 1, level: 9.5, objective: "Y9 mandative subjunctive" },
  { stem: "Which sentence uses parallel structure?", choices: ["She likes reading, writing and to paint.", "She likes to read, writing and painting.", "She likes reading, writing and painting.", "She likes reading, to write and paint."], answer: 2, level: 9.0, objective: "Y9 parallel structure" },
  { stem: "Which sentence uses a dash for dramatic emphasis?", choices: ["There was only one thing left to do – run.", "There was only one – thing left to do run.", "There – was only one thing left to do, run.", "There was only one thing – left to do run."], answer: 0, level: 8.6, objective: "Y9 dash for emphasis" },
  { stem: "Which of these is a rhetorical question?", choices: ["What time does the train leave?", "Where did you put my keys?", "How many sides does a hexagon have?", "Who wouldn't want cleaner air for their children?"], answer: 3, level: 8.5, objective: "Y9 rhetorical questions" },
  { stem: "Which sentence uses 'whom' correctly?", choices: ["Whom is coming to the party?", "To whom should I address the letter?", "Whom wrote this essay?", "The girl whom won the prize was delighted."], answer: 1, level: 9.8, objective: "Y9 who and whom" },
  { stem: "Which word is a gerund in 'Swimming in the sea is my favourite activity'?", choices: ["Swimming", "sea", "favourite", "activity"], answer: 0, level: 9.6, objective: "Y9 gerunds as nouns" },
  { stem: "Which is the most concise version of 'Due to the fact that it was raining, the match was postponed to a later date'?", choices: ["Due to the fact of the rain, the match was postponed to later.", "Owing to the fact that rain was falling, the match was postponed to a later date.", "Because it was raining, the match was postponed.", "It rained, and the match was postponed to a date that was later."], answer: 2, level: 9.0, objective: "Y9 concise formal style" },
  { stem: "Which sentence is correct?", choices: ["The company announced it's results.", "The company announced its' results.", "The company announced it is results.", "The company announced its results."], answer: 3, level: 8.5, objective: "Y9 its and it's" },
  { stem: "Which conditional sentence is correct?", choices: ["If I would have known, I would have helped.", "If I had knew, I would have helped.", "If I had known, I would have helped.", "If I have known, I would help."], answer: 2, level: 9.2, objective: "Y9 third conditional" },
];

// ---------------------------------------------------------------------------
// SPELLING (80 items, Years 1–9)
// ---------------------------------------------------------------------------

export const SPELLINGS: Spelling[] = [
  // Year 1
  { correct: "said", wrong: ["sed", "saed", "sayd"], level: 1.2 },
  { correct: "friend", wrong: ["frend", "freind", "frende"], level: 1.8 },
  { correct: "school", wrong: ["skool", "scool", "shcool"], level: 1.6 },
  { correct: "they", wrong: ["thay", "thei", "tey"], level: 1.2 },
  { correct: "was", wrong: ["woz", "wos", "waz"], level: 1.0 },
  { correct: "come", wrong: ["cum", "kom", "comm"], level: 1.3 },
  { correct: "here", wrong: ["heer", "hiere", "hir"], level: 1.4 },
  { correct: "house", wrong: ["hous", "howse", "hause"], level: 1.5 },

  // Year 2
  { correct: "because", wrong: ["becos", "becuase", "beacause"], level: 2.0 },
  { correct: "people", wrong: ["peple", "peeple", "poeple"], level: 2.2 },
  { correct: "beautiful", wrong: ["butiful", "beautifull", "beutiful"], level: 2.6 },
  { correct: "after", wrong: ["arfter", "afer", "aftre"], level: 1.8 },
  { correct: "every", wrong: ["evry", "everey", "evere"], level: 2.0 },
  { correct: "water", wrong: ["warter", "wotter", "watter"], level: 2.1 },
  { correct: "children", wrong: ["childern", "chilren", "childen"], level: 2.3 },
  { correct: "money", wrong: ["muny", "monney", "mony"], level: 2.4 },
  { correct: "climb", wrong: ["clime", "clim", "climbe"], level: 2.5 },

  // Year 3
  { correct: "answer", wrong: ["anser", "awnser", "answere"], level: 3.0 },
  { correct: "build", wrong: ["bild", "biuld", "buld"], level: 3.0 },
  { correct: "busy", wrong: ["bizzy", "buisy", "bisy"], level: 3.2 },
  { correct: "caught", wrong: ["cort", "cought", "caugt"], level: 3.4 },
  { correct: "early", wrong: ["erly", "earley", "urly"], level: 2.8 },
  { correct: "heart", wrong: ["hert", "haert", "heartt"], level: 3.0 },
  { correct: "island", wrong: ["iland", "ilend", "islend"], level: 3.5 },
  { correct: "learn", wrong: ["lern", "laern", "lurn"], level: 3.0 },
  { correct: "minute", wrong: ["minit", "minnute", "minut"], level: 3.3 },

  // Year 4
  { correct: "believe", wrong: ["beleive", "belive", "beleve"], level: 4.0 },
  { correct: "different", wrong: ["diffrent", "diferent", "differant"], level: 3.8 },
  { correct: "February", wrong: ["Febuary", "Febrary", "Feburary"], level: 4.3 },
  { correct: "library", wrong: ["libary", "liberry", "libery"], level: 3.8 },
  { correct: "separate", wrong: ["seperate", "separete", "sepparate"], level: 4.6 },
  { correct: "surprise", wrong: ["suprise", "surprize", "surpise"], level: 4.0 },
  { correct: "probably", wrong: ["probly", "probabley", "probaly"], level: 4.2 },
  { correct: "therefore", wrong: ["therefor", "therfore", "thearfore"], level: 4.4 },
  { correct: "knowledge", wrong: ["knowlege", "nowledge", "knolledge"], level: 4.5 },

  // Year 5
  { correct: "ancient", wrong: ["anchient", "ancent", "aincient"], level: 5.0 },
  { correct: "average", wrong: ["avrage", "averige", "averadge"], level: 4.8 },
  { correct: "bruise", wrong: ["brues", "bruse", "broose"], level: 5.2 },
  { correct: "category", wrong: ["catagory", "categery", "catergory"], level: 5.4 },
  { correct: "dictionary", wrong: ["dictionery", "dictonary", "dicshonary"], level: 5.0 },
  { correct: "forty", wrong: ["fourty", "fortey", "forthy"], level: 5.3 },
  { correct: "muscle", wrong: ["mussle", "muscel", "musle"], level: 5.5 },
  { correct: "queue", wrong: ["que", "qeue", "queu"], level: 5.4 },
  { correct: "soldier", wrong: ["soljer", "souldier", "soldjer"], level: 5.2 },

  // Year 6
  { correct: "accommodate", wrong: ["accomodate", "acommodate", "accommadate"], level: 6.5 },
  { correct: "embarrass", wrong: ["embarass", "embarras", "embaress"], level: 6.3 },
  { correct: "environment", wrong: ["enviroment", "envirnment", "environmant"], level: 6.0 },
  { correct: "exaggerate", wrong: ["exagerate", "exxagerate", "exaggarate"], level: 6.4 },
  { correct: "definite", wrong: ["definate", "definit", "defanite"], level: 6.0 },
  { correct: "mischievous", wrong: ["mischievious", "mischevous", "mischeivous"], level: 6.6 },
  { correct: "occur", wrong: ["ocur", "occure", "occer"], level: 5.8 },
  { correct: "privilege", wrong: ["priviledge", "privilage", "privelege"], level: 6.6 },
  { correct: "restaurant", wrong: ["restaraunt", "resturant", "restuarant"], level: 6.2 },

  // Year 7
  { correct: "beginning", wrong: ["begining", "beggining", "beginnig"], level: 6.8 },
  { correct: "disappoint", wrong: ["dissapoint", "disapoint", "dissappoint"], level: 7.0 },
  { correct: "argument", wrong: ["arguement", "argumant", "arguemant"], level: 7.0 },
  { correct: "business", wrong: ["buisness", "bussiness", "busness"], level: 7.2 },
  { correct: "necessary", wrong: ["neccessary", "necessery", "nesessary"], level: 7.4 },
  { correct: "government", wrong: ["goverment", "govenment", "governmant"], level: 7.3 },
  { correct: "persuade", wrong: ["persuaid", "pursuade", "perswade"], level: 7.0 },
  { correct: "achieve", wrong: ["acheive", "achive", "acheeve"], level: 6.9 },
  { correct: "weird", wrong: ["wierd", "weerd", "weard"], level: 7.2 },

  // Year 8
  { correct: "conscience", wrong: ["concience", "conscence", "consciense"], level: 8.2 },
  { correct: "rhythm", wrong: ["rythm", "rhythem", "rhythmn"], level: 8.0 },
  { correct: "conscious", wrong: ["concious", "consious", "conscous"], level: 8.0 },
  { correct: "occasionally", wrong: ["occassionally", "ocasionally", "occasionaly"], level: 8.3 },
  { correct: "independent", wrong: ["independant", "indipendent", "independint"], level: 7.8 },
  { correct: "recommend", wrong: ["reccomend", "recomend", "reccommend"], level: 8.2 },
  { correct: "sincerely", wrong: ["sincerly", "sincerley", "sinserely"], level: 7.8 },
  { correct: "definitely", wrong: ["definately", "definitly", "defenitely"], level: 7.9 },
  { correct: "guarantee", wrong: ["garantee", "guarentee", "guarrantee"], level: 8.5 },

  // Year 9
  { correct: "questionnaire", wrong: ["questionaire", "questionnair", "questionnare"], level: 9.0 },
  { correct: "millennium", wrong: ["millenium", "milennium", "milenium"], level: 9.0 },
  { correct: "conscientious", wrong: ["consciencious", "conscientous", "concientious"], level: 9.6 },
  { correct: "liaison", wrong: ["liason", "liasion", "laison"], level: 9.4 },
  { correct: "parallel", wrong: ["paralel", "parrallel", "parralel"], level: 8.8 },
  { correct: "hierarchy", wrong: ["heirarchy", "hierachy", "hierarcy"], level: 9.2 },
  { correct: "onomatopoeia", wrong: ["onomatopeia", "onomatopoea", "onamatopoeia"], level: 9.5 },
  { correct: "silhouette", wrong: ["silhouete", "silouette", "sillhouette"], level: 9.3 },
  { correct: "entrepreneur", wrong: ["entrepeneur", "enterpreneur", "entreprenuer"], level: 9.6 },
];

// ---------------------------------------------------------------------------
// SYNONYMS (60 items, 12 per band) · "closest in meaning"
// ---------------------------------------------------------------------------

export const SYNONYMS: WordItem[] = [
  // Band 1
  { word: "big", answer: "large", distractors: ["small", "red", "fast"], level: 1.0 },
  { word: "happy", answer: "glad", distractors: ["sad", "wet", "hot"], level: 1.0 },
  { word: "fast", answer: "quick", distractors: ["slow", "tall", "cold"], level: 1.2 },
  { word: "little", answer: "small", distractors: ["big", "soft", "loud"], level: 1.3 },
  { word: "shut", answer: "close", distractors: ["open", "push", "sit"], level: 1.5 },
  { word: "start", answer: "begin", distractors: ["end", "jump", "look"], level: 1.8 },
  { word: "shout", answer: "yell", distractors: ["whisper", "sing", "run"], level: 2.0 },
  { word: "cold", answer: "chilly", distractors: ["warm", "wet", "dark"], level: 2.0 },
  { word: "tired", answer: "sleepy", distractors: ["awake", "hungry", "angry"], level: 2.2 },
  { word: "smile", answer: "grin", distractors: ["frown", "laugh", "wave"], level: 2.5 },
  { word: "mend", answer: "fix", distractors: ["break", "wash", "find"], level: 2.5 },
  { word: "scared", answer: "afraid", distractors: ["brave", "bored", "tall"], level: 2.8 },

  // Band 2
  { word: "enormous", answer: "huge", distractors: ["tiny", "heavy", "round"], level: 3.0 },
  { word: "silent", answer: "quiet", distractors: ["noisy", "empty", "dark"], level: 3.0 },
  { word: "ancient", answer: "very old", distractors: ["modern", "broken", "famous"], level: 3.5 },
  { word: "furious", answer: "very angry", distractors: ["calm", "puzzled", "hungry"], level: 3.5 },
  { word: "brave", answer: "courageous", distractors: ["cowardly", "strong", "kind"], level: 3.5 },
  { word: "damp", answer: "moist", distractors: ["dry", "cold", "dirty"], level: 3.8 },
  { word: "rapid", answer: "swift", distractors: ["sluggish", "sudden", "loud"], level: 4.0 },
  { word: "sly", answer: "cunning", distractors: ["honest", "shy", "angry"], level: 4.0 },
  { word: "weary", answer: "tired", distractors: ["lively", "cross", "worried"], level: 4.2 },
  { word: "fragile", answer: "delicate", distractors: ["sturdy", "heavy", "sharp"], level: 4.5 },
  { word: "peculiar", answer: "strange", distractors: ["ordinary", "angry", "polite"], level: 4.5 },
  { word: "glance", answer: "quick look", distractors: ["long stare", "loud call", "short nap"], level: 4.6 },

  // Band 3
  { word: "vast", answer: "immense", distractors: ["narrow", "empty", "distant"], level: 5.0 },
  { word: "conceal", answer: "hide", distractors: ["reveal", "seal", "steal"], level: 5.0 },
  { word: "vivid", answer: "bright", distractors: ["dull", "quick", "loud"], level: 5.0 },
  { word: "transparent", answer: "see-through", distractors: ["opaque", "shiny", "thin"], level: 5.5 },
  { word: "cautious", answer: "careful", distractors: ["reckless", "nervous", "slow"], level: 5.5 },
  { word: "abundant", answer: "plentiful", distractors: ["scarce", "hidden", "colourful"], level: 6.0 },
  { word: "reluctant", answer: "unwilling", distractors: ["eager", "unable", "unhappy"], level: 6.0 },
  { word: "fatigue", answer: "tiredness", distractors: ["energy", "sickness", "hunger"], level: 6.0 },
  { word: "obstacle", answer: "barrier", distractors: ["path", "puzzle", "goal"], level: 6.0 },
  { word: "cherish", answer: "treasure", distractors: ["neglect", "share", "carry"], level: 6.5 },
  { word: "precise", answer: "exact", distractors: ["vague", "small", "quick"], level: 6.5 },
  { word: "humble", answer: "modest", distractors: ["arrogant", "poor", "quiet"], level: 7.0 },

  // Band 4
  { word: "diligent", answer: "hard-working", distractors: ["lazy", "clever", "punctual"], level: 7.0 },
  { word: "tranquil", answer: "peaceful", distractors: ["turbulent", "silent", "sleepy"], level: 7.0 },
  { word: "hostile", answer: "unfriendly", distractors: ["welcoming", "jealous", "distant"], level: 7.0 },
  { word: "ambiguous", answer: "unclear", distractors: ["definite", "complicated", "unusual"], level: 8.0 },
  { word: "benevolent", answer: "kind-hearted", distractors: ["malicious", "wealthy", "powerful"], level: 8.0 },
  { word: "meagre", answer: "insufficient", distractors: ["lavish", "hungry", "ordinary"], level: 8.0 },
  { word: "frugal", answer: "thrifty", distractors: ["extravagant", "poor", "fruitful"], level: 8.0 },
  { word: "scrutinise", answer: "examine closely", distractors: ["glance at", "criticise", "approve"], level: 8.5 },
  { word: "candid", answer: "frank", distractors: ["deceitful", "sweet", "shy"], level: 8.5 },
  { word: "inevitable", answer: "unavoidable", distractors: ["unlikely", "unexpected", "unbearable"], level: 8.5 },
  { word: "resilient", answer: "quick to recover", distractors: ["fragile", "stubborn", "flexible"], level: 8.5 },
  { word: "eloquent", answer: "articulate", distractors: ["inarticulate", "elegant", "loud"], level: 9.0 },

  // Band 5
  { word: "obstinate", answer: "stubborn", distractors: ["compliant", "obvious", "outraged"], level: 9.0 },
  { word: "meticulous", answer: "painstaking", distractors: ["careless", "timid", "ambitious"], level: 9.5 },
  { word: "lucid", answer: "clear", distractors: ["muddled", "lucky", "calm"], level: 9.5 },
  { word: "adversary", answer: "opponent", distractors: ["ally", "critic", "victim"], level: 9.5 },
  { word: "ubiquitous", answer: "found everywhere", distractors: ["rare", "enormous", "ancient"], level: 10.0 },
  { word: "ephemeral", answer: "short-lived", distractors: ["everlasting", "delicate", "invisible"], level: 10.0 },
  { word: "pragmatic", answer: "practical", distractors: ["idealistic", "dogmatic", "cautious"], level: 10.0 },
  { word: "tenacious", answer: "persistent", distractors: ["irresolute", "aggressive", "cautious"], level: 10.0 },
  { word: "superfluous", answer: "unnecessary", distractors: ["essential", "excellent", "plentiful"], level: 10.5 },
  { word: "conjecture", answer: "guess", distractors: ["certainty", "conclusion", "argument"], level: 10.5 },
  { word: "ameliorate", answer: "improve", distractors: ["worsen", "explain", "delay"], level: 11.0 },
  { word: "mitigate", answer: "lessen", distractors: ["intensify", "avoid", "punish"], level: 11.0 },
];

// ---------------------------------------------------------------------------
// ANTONYMS (60 items, 12 per band) · "most opposite in meaning"
// ---------------------------------------------------------------------------

export const ANTONYMS: WordItem[] = [
  // Band 1
  { word: "hot", answer: "cold", distractors: ["warm", "wet", "sunny"], level: 1.0 },
  { word: "up", answer: "down", distractors: ["high", "over", "out"], level: 1.0 },
  { word: "big", answer: "small", distractors: ["huge", "long", "fat"], level: 1.0 },
  { word: "day", answer: "night", distractors: ["sun", "morning", "week"], level: 1.3 },
  { word: "happy", answer: "sad", distractors: ["glad", "cross", "silly"], level: 1.3 },
  { word: "open", answer: "shut", distractors: ["wide", "push", "door"], level: 1.5 },
  { word: "full", answer: "empty", distractors: ["heavy", "packed", "round"], level: 1.8 },
  { word: "fast", answer: "slow", distractors: ["quick", "late", "soft"], level: 1.8 },
  { word: "wet", answer: "dry", distractors: ["damp", "cold", "clean"], level: 2.0 },
  { word: "loud", answer: "quiet", distractors: ["noisy", "high", "deep"], level: 2.0 },
  { word: "early", answer: "late", distractors: ["soon", "first", "fast"], level: 2.5 },
  { word: "easy", answer: "difficult", distractors: ["simple", "soft", "short"], level: 2.5 },

  // Band 2
  { word: "ancient", answer: "modern", distractors: ["old", "broken", "famous"], level: 3.0 },
  { word: "float", answer: "sink", distractors: ["drift", "swim", "splash"], level: 3.0 },
  { word: "shallow", answer: "deep", distractors: ["low", "narrow", "clear"], level: 3.0 },
  { word: "polite", answer: "rude", distractors: ["courteous", "quiet", "proud"], level: 3.0 },
  { word: "generous", answer: "selfish", distractors: ["kind", "wealthy", "cheerful"], level: 3.5 },
  { word: "arrive", answer: "depart", distractors: ["reach", "wait", "travel"], level: 3.5 },
  { word: "victory", answer: "defeat", distractors: ["triumph", "battle", "prize"], level: 3.5 },
  { word: "expand", answer: "shrink", distractors: ["grow", "explode", "bend"], level: 4.0 },
  { word: "frequent", answer: "rare", distractors: ["often", "quick", "ready"], level: 4.0 },
  { word: "include", answer: "exclude", distractors: ["contain", "collect", "conclude"], level: 4.0 },
  { word: "ascend", answer: "descend", distractors: ["climb", "decide", "extend"], level: 4.5 },
  { word: "temporary", answer: "permanent", distractors: ["brief", "important", "contrary"], level: 4.5 },

  // Band 3
  { word: "minimum", answer: "maximum", distractors: ["least", "average", "minimal"], level: 4.5 },
  { word: "reveal", answer: "conceal", distractors: ["show", "review", "expose"], level: 5.0 },
  { word: "vertical", answer: "horizontal", distractors: ["upright", "diagonal", "steep"], level: 5.0 },
  { word: "hostile", answer: "friendly", distractors: ["aggressive", "lonely", "homely"], level: 5.0 },
  { word: "ally", answer: "enemy", distractors: ["friend", "neighbour", "stranger"], level: 5.0 },
  { word: "reckless", answer: "cautious", distractors: ["careless", "fearless", "clumsy"], level: 5.5 },
  { word: "abundant", answer: "scarce", distractors: ["plentiful", "small", "hidden"], level: 6.0 },
  { word: "optimistic", answer: "pessimistic", distractors: ["hopeful", "realistic", "energetic"], level: 6.0 },
  { word: "transparent", answer: "opaque", distractors: ["clear", "shiny", "solid"], level: 6.0 },
  { word: "modest", answer: "boastful", distractors: ["humble", "shy", "generous"], level: 6.0 },
  { word: "voluntary", answer: "compulsory", distractors: ["willing", "temporary", "voluble"], level: 6.5 },
  { word: "inferior", answer: "superior", distractors: ["lesser", "interior", "equal"], level: 6.5 },

  // Band 4
  { word: "praise", answer: "criticise", distractors: ["compliment", "prize", "ignore"], level: 7.0 },
  { word: "tranquil", answer: "turbulent", distractors: ["calm", "tropical", "tired"], level: 7.5 },
  { word: "lenient", answer: "strict", distractors: ["tolerant", "slow", "lazy"], level: 7.5 },
  { word: "benevolent", answer: "malevolent", distractors: ["charitable", "indifferent", "benign"], level: 8.0 },
  { word: "affluent", answer: "impoverished", distractors: ["wealthy", "fluent", "influential"], level: 8.0 },
  { word: "transient", answer: "permanent", distractors: ["fleeting", "transparent", "travelling"], level: 8.0 },
  { word: "scarcity", answer: "abundance", distractors: ["shortage", "famine", "quality"], level: 8.0 },
  { word: "diligent", answer: "negligent", distractors: ["industrious", "intelligent", "patient"], level: 8.0 },
  { word: "concur", answer: "disagree", distractors: ["agree", "compete", "conclude"], level: 8.0 },
  { word: "candid", answer: "evasive", distractors: ["frank", "sweet", "careful"], level: 8.5 },
  { word: "humility", answer: "arrogance", distractors: ["modesty", "humidity", "honesty"], level: 8.5 },
  { word: "obscure", answer: "well-known", distractors: ["unknown", "distant", "complex"], level: 8.5 },

  // Band 5
  { word: "amplify", answer: "diminish", distractors: ["magnify", "simplify", "clarify"], level: 9.0 },
  { word: "verbose", answer: "concise", distractors: ["wordy", "verbal", "vague"], level: 9.5 },
  { word: "frugal", answer: "extravagant", distractors: ["thrifty", "fruitful", "fragile"], level: 9.5 },
  { word: "lethargic", answer: "energetic", distractors: ["sluggish", "allergic", "lethal"], level: 9.5 },
  { word: "ephemeral", answer: "enduring", distractors: ["fleeting", "ethereal", "emotional"], level: 10.0 },
  { word: "benign", answer: "malignant", distractors: ["harmless", "bland", "benevolent"], level: 10.0 },
  { word: "prosperity", answer: "adversity", distractors: ["wealth", "property", "popularity"], level: 10.0 },
  { word: "candour", answer: "deceit", distractors: ["frankness", "courtesy", "caution"], level: 10.0 },
  { word: "zenith", answer: "nadir", distractors: ["summit", "horizon", "zero"], level: 10.5 },
  { word: "ostentatious", answer: "understated", distractors: ["showy", "ostensible", "outrageous"], level: 10.5 },
  { word: "reticent", answer: "forthcoming", distractors: ["reserved", "recent", "resentful"], level: 10.5 },
  { word: "exacerbate", answer: "alleviate", distractors: ["worsen", "exaggerate", "exasperate"], level: 11.0 },
];

// ---------------------------------------------------------------------------
// ANALOGIES (50 items, 10 per band) · a is to b as c is to ?
// ---------------------------------------------------------------------------

export const ANALOGIES: Analogy[] = [
  // Band 1
  { a: "one", b: "two", c: "three", answer: "four", distractors: ["five", "three", "ten"], level: 1.2 },
  { a: "hot", b: "cold", c: "up", answer: "down", distractors: ["top", "high", "over"], level: 1.3 },
  { a: "cat", b: "kitten", c: "dog", answer: "puppy", distractors: ["calf", "bone", "cub"], level: 1.5 },
  { a: "day", b: "night", c: "black", answer: "white", distractors: ["dark", "grey", "blue"], level: 1.5 },
  { a: "eye", b: "see", c: "ear", answer: "hear", distractors: ["nose", "music", "loud"], level: 1.8 },
  { a: "bird", b: "nest", c: "bee", answer: "hive", distractors: ["honey", "web", "flower"], level: 2.0 },
  { a: "fish", b: "swim", c: "bird", answer: "fly", distractors: ["nest", "feather", "sing"], level: 2.0 },
  { a: "cow", b: "milk", c: "hen", answer: "egg", distractors: ["farm", "chick", "feather"], level: 2.0 },
  { a: "hand", b: "glove", c: "head", answer: "hat", distractors: ["hair", "face", "scarf"], level: 2.5 },
  { a: "big", b: "bigger", c: "small", answer: "smaller", distractors: ["smallest", "tiny", "big"], level: 2.8 },

  // Band 2
  { a: "glove", b: "hand", c: "boot", answer: "foot", distractors: ["leg", "lace", "sock"], level: 3.0 },
  { a: "wheel", b: "car", c: "wing", answer: "aeroplane", distractors: ["bird", "feather", "pilot"], level: 3.0 },
  { a: "teacher", b: "school", c: "doctor", answer: "hospital", distractors: ["nurse", "medicine", "patient"], level: 3.0 },
  { a: "author", b: "book", c: "artist", answer: "painting", distractors: ["brush", "gallery", "colour"], level: 3.5 },
  { a: "water", b: "thirsty", c: "food", answer: "hungry", distractors: ["cook", "full", "plate"], level: 3.5 },
  { a: "north", b: "south", c: "east", answer: "west", distractors: ["left", "sunrise", "north"], level: 3.5 },
  { a: "mouse", b: "mice", c: "goose", answer: "geese", distractors: ["gooses", "duck", "gosling"], level: 4.0 },
  { a: "caterpillar", b: "butterfly", c: "tadpole", answer: "frog", distractors: ["fish", "pond", "toad"], level: 4.0 },
  { a: "Monday", b: "Tuesday", c: "June", answer: "July", distractors: ["May", "August", "summer"], level: 4.0 },
  { a: "sheep", b: "flock", c: "fish", answer: "shoal", distractors: ["herd", "pack", "swarm"], level: 4.5 },

  // Band 3
  { a: "hive", b: "bee", c: "burrow", answer: "rabbit", distractors: ["soil", "tunnel", "eagle"], level: 4.5 },
  { a: "speak", b: "spoke", c: "write", answer: "wrote", distractors: ["written", "writed", "writes"], level: 4.5 },
  { a: "ruler", b: "length", c: "scales", answer: "weight", distractors: ["kitchen", "height", "number"], level: 5.0 },
  { a: "brave", b: "cowardly", c: "generous", answer: "mean", distractors: ["kind", "rich", "brave"], level: 5.0 },
  { a: "oasis", b: "desert", c: "island", answer: "sea", distractors: ["sand", "beach", "palm"], level: 5.5 },
  { a: "pen", b: "writer", c: "scalpel", answer: "surgeon", distractors: ["hospital", "knife", "patient"], level: 6.0 },
  { a: "flock", b: "sheep", c: "constellation", answer: "stars", distractors: ["sky", "planets", "galaxy"], level: 6.0 },
  { a: "chapter", b: "book", c: "scene", answer: "play", distractors: ["stage", "actor", "film"], level: 6.0 },
  { a: "mammal", b: "whale", c: "reptile", answer: "crocodile", distractors: ["frog", "dolphin", "salmon"], level: 6.0 },
  { a: "Japan", b: "yen", c: "United Kingdom", answer: "pound", distractors: ["euro", "London", "dollar"], level: 6.5 },

  // Band 4
  { a: "carnivore", b: "meat", c: "herbivore", answer: "plants", distractors: ["insects", "animals", "teeth"], level: 7.0 },
  { a: "architect", b: "building", c: "composer", answer: "music", distractors: ["orchestra", "piano", "conductor"], level: 7.0 },
  { a: "microscope", b: "small", c: "telescope", answer: "distant", distractors: ["large", "bright", "planet"], level: 7.5 },
  { a: "drought", b: "rain", c: "famine", answer: "food", distractors: ["hunger", "harvest", "water"], level: 8.0 },
  { a: "whisper", b: "shout", c: "drizzle", answer: "downpour", distractors: ["rain", "cloud", "puddle"], level: 8.0 },
  { a: "fossil", b: "palaeontologist", c: "star", answer: "astronomer", distractors: ["astronaut", "geologist", "telescope"], level: 8.0 },
  { a: "prologue", b: "epilogue", c: "dawn", answer: "dusk", distractors: ["sunrise", "morning", "midnight"], level: 8.5 },
  { a: "optimist", b: "hope", c: "sceptic", answer: "doubt", distractors: ["belief", "anger", "sceptre"], level: 9.0 },
  { a: "irrigate", b: "water", c: "ventilate", answer: "air", distractors: ["fan", "window", "breathe"], level: 9.0 },
  { a: "oxygen", b: "element", c: "water", answer: "compound", distractors: ["liquid", "molecule", "mixture"], level: 9.5 },

  // Band 5
  { a: "calligrapher", b: "pen", c: "sculptor", answer: "chisel", distractors: ["statue", "marble", "gallery"], level: 9.0 },
  { a: "chronological", b: "time", c: "alphabetical", answer: "letters", distractors: ["words", "order", "numbers"], level: 9.5 },
  { a: "cartographer", b: "map", c: "lexicographer", answer: "dictionary", distractors: ["language", "encyclopaedia", "words"], level: 10.0 },
  { a: "aquatic", b: "water", c: "arboreal", answer: "trees", distractors: ["air", "soil", "desert"], level: 10.0 },
  { a: "benevolent", b: "malevolent", c: "philanthropist", answer: "misanthrope", distractors: ["donor", "patron", "miser"], level: 10.5 },
  { a: "symptom", b: "diagnosis", c: "clue", answer: "deduction", distractors: ["detective", "crime", "mystery"], level: 10.5 },
  { a: "quench", b: "thirst", c: "satiate", answer: "hunger", distractors: ["food", "feast", "thirst"], level: 10.5 },
  { a: "verbose", b: "words", c: "extravagant", answer: "money", distractors: ["luxury", "poverty", "savings"], level: 10.5 },
  { a: "anthology", b: "poems", c: "archipelago", answer: "islands", distractors: ["ocean", "peninsula", "continents"], level: 10.5 },
  { a: "spark", b: "fire", c: "catalyst", answer: "reaction", distractors: ["chemical", "laboratory", "enzyme"], level: 11.0 },
];

// ---------------------------------------------------------------------------
// ODD ONE OUT (50 items, 10 per band)
// ---------------------------------------------------------------------------

export const ODD_ONE_OUT: OddOne[] = [
  // Band 1
  { options: ["red", "chair", "blue", "green", "yellow"], answer: 1, reason: "A chair is not a colour.", level: 1.0 },
  { options: ["dog", "cow", "sheep", "car", "horse"], answer: 3, reason: "A car is not an animal.", level: 1.0 },
  { options: ["apple", "banana", "carrot", "pear", "grape"], answer: 2, reason: "A carrot is a vegetable; the others are fruits.", level: 1.2 },
  { options: ["goldfish", "duck", "swan", "hen", "robin"], answer: 0, reason: "A goldfish is a fish; the others are birds.", level: 1.5 },
  { options: ["cup", "mug", "glass", "beaker", "fork"], answer: 4, reason: "You cannot drink from a fork.", level: 1.5 },
  { options: ["run", "jump", "hop", "skip", "bed"], answer: 4, reason: "Bed is a thing, not an action.", level: 1.8 },
  { options: ["Monday", "March", "Friday", "Sunday", "Tuesday"], answer: 1, reason: "March is a month; the others are days of the week.", level: 2.0 },
  { options: ["happy", "glad", "sad", "cheerful", "jolly"], answer: 2, reason: "Sad means the opposite of the others.", level: 2.5 },
  { options: ["two", "four", "six", "nine", "eight"], answer: 3, reason: "Nine is an odd number; the others are even.", level: 2.5 },
  { options: ["rain", "snow", "sand", "hail", "sleet"], answer: 2, reason: "Sand does not fall from the sky as weather.", level: 2.8 },

  // Band 2
  { options: ["Cairo", "Paris", "Rome", "Madrid", "Africa"], answer: 4, reason: "Africa is a continent; the others are cities.", level: 3.0 },
  { options: ["triangle", "square", "circle", "pentagon", "hexagon"], answer: 2, reason: "A circle has no straight sides.", level: 3.0 },
  { options: ["Mercury", "Mars", "Venus", "Moon", "Jupiter"], answer: 3, reason: "The Moon is not a planet.", level: 3.5 },
  { options: ["iron", "copper", "gold", "wood", "silver"], answer: 3, reason: "Wood is not a metal.", level: 3.5 },
  { options: ["trumpet", "violin", "cello", "guitar", "harp"], answer: 0, reason: "A trumpet is a brass instrument; the others have strings.", level: 3.5 },
  { options: ["jumped", "sing", "ran", "swam", "walked"], answer: 1, reason: "Sing is in the present tense; the others are past tense.", level: 3.5 },
  { options: ["ant", "beetle", "spider", "bee", "ladybird"], answer: 2, reason: "A spider has eight legs and is not an insect.", level: 4.0 },
  { options: ["inch", "metre", "centimetre", "kilogram", "mile"], answer: 3, reason: "A kilogram measures mass; the others measure length.", level: 4.0 },
  { options: ["whale", "dolphin", "shark", "seal", "otter"], answer: 2, reason: "A shark is a fish; the others are mammals.", level: 4.5 },
  { options: ["happily", "slowly", "quickly", "lovely", "loudly"], answer: 3, reason: "Lovely is an adjective; the others are adverbs.", level: 4.5 },

  // Band 3
  { options: ["lion", "cheetah", "tiger", "leopard", "wolf"], answer: 4, reason: "A wolf is not a member of the cat family.", level: 4.5 },
  { options: ["noun", "verb", "adjective", "sentence", "adverb"], answer: 3, reason: "A sentence is not a word class.", level: 5.0 },
  { options: ["Nile", "Amazon", "Thames", "Sahara", "Danube"], answer: 3, reason: "The Sahara is a desert; the others are rivers.", level: 5.0 },
  { options: ["cotton", "granite", "marble", "chalk", "slate"], answer: 0, reason: "Cotton is not a rock.", level: 5.0 },
  { options: ["telescope", "microscope", "magnifying glass", "binoculars", "megaphone"], answer: 4, reason: "A megaphone makes sounds louder; the others help you see.", level: 5.0 },
  { options: ["heart", "lungs", "liver", "kidneys", "elbow"], answer: 4, reason: "The elbow is a joint, not an internal organ.", level: 5.5 },
  { options: ["9", "40", "16", "25", "36"], answer: 1, reason: "40 is not a square number.", level: 5.5 },
  { options: ["evaporation", "photosynthesis", "condensation", "precipitation", "collection"], answer: 1, reason: "Photosynthesis is not part of the water cycle.", level: 6.0 },
  { options: ["delighted", "ecstatic", "anxious", "thrilled", "overjoyed"], answer: 2, reason: "Anxious describes worry; the others describe great happiness.", level: 6.0 },
  { options: ["simile", "metaphor", "personification", "paragraph", "alliteration"], answer: 3, reason: "A paragraph is not a figure of speech.", level: 6.5 },

  // Band 4
  { options: ["isosceles", "parallelogram", "scalene", "equilateral", "right-angled"], answer: 1, reason: "A parallelogram is not a type of triangle.", level: 7.0 },
  { options: ["2", "3", "5", "9", "11"], answer: 3, reason: "9 is not a prime number.", level: 7.0 },
  { options: ["cube", "cuboid", "sphere", "pyramid", "prism"], answer: 2, reason: "A sphere has no flat faces.", level: 7.0 },
  { options: ["photosynthesis", "respiration", "digestion", "erosion", "circulation"], answer: 3, reason: "Erosion is a geological process; the others happen in living things.", level: 7.5 },
  { options: ["serene", "frightened", "terrified", "petrified", "alarmed"], answer: 0, reason: "Serene means calm; the others describe fear.", level: 7.5 },
  { options: ["meticulous", "careful", "careless", "thorough", "painstaking"], answer: 2, reason: "Careless means the opposite of the others.", level: 8.0 },
  { options: ["sonnet", "haiku", "limerick", "novel", "ballad"], answer: 3, reason: "A novel is written in prose; the others are forms of poetry.", level: 8.0 },
  { options: ["Mercury", "Venus", "Earth", "Mars", "Saturn"], answer: 4, reason: "Saturn is a gas giant; the others are rocky planets.", level: 8.0 },
  { options: ["lemon juice", "vinegar", "orange juice", "soap", "cola"], answer: 3, reason: "Soap is alkaline; the others are acidic.", level: 8.5 },
  { options: ["although", "because", "however", "unless", "since"], answer: 2, reason: "However is an adverb; the others are subordinating conjunctions.", level: 9.0 },

  // Band 5
  { options: ["gravity", "friction", "magnetism", "velocity", "air resistance"], answer: 3, reason: "Velocity is not a force.", level: 9.0 },
  { options: ["artery", "vein", "capillary", "neuron", "aorta"], answer: 3, reason: "A neuron is a nerve cell; the others are blood vessels.", level: 9.5 },
  { options: ["ominous", "foreboding", "jubilant", "menacing", "sinister"], answer: 2, reason: "Jubilant is joyful; the others suggest threat.", level: 9.5 },
  { options: ["past tense", "first person", "second person", "third person", "omniscient"], answer: 0, reason: "Past tense is a tense; the others are narrative points of view.", level: 9.5 },
  { options: ["ephemeral", "perennial", "transient", "fleeting", "momentary"], answer: 1, reason: "Perennial means lasting; the others mean short-lived.", level: 10.0 },
  { options: ["helium", "nitrogen", "neon", "argon", "krypton"], answer: 1, reason: "Nitrogen is not a noble gas.", level: 10.0 },
  { options: ["idealistic", "pragmatic", "practical", "realistic", "sensible"], answer: 0, reason: "Idealistic contrasts with the practical outlook of the others.", level: 10.0 },
  { options: ["metaphor", "simile", "iambic pentameter", "hyperbole", "oxymoron"], answer: 2, reason: "Iambic pentameter is a metre; the others are figures of speech.", level: 10.5 },
  { options: ["mitosis", "meiosis", "binary fission", "budding", "osmosis"], answer: 4, reason: "Osmosis is the movement of water; the others are types of cell or organism reproduction.", level: 10.5 },
  { options: ["benevolent", "altruistic", "magnanimous", "philanthropic", "parsimonious"], answer: 4, reason: "Parsimonious means mean with money; the others suggest generosity.", level: 11.0 },
];

// ---------------------------------------------------------------------------
// PHONICS (24 items, Years 1–2) · the computer says `say`; child picks it.
// ---------------------------------------------------------------------------

export const PHONICS: Phonics[] = [
  { say: "ship", choices: ["ship", "chip", "shop", "sheep"], answer: 0, level: 1.0 },
  { say: "chin", choices: ["shin", "thin", "chin", "chip"], answer: 2, level: 1.0 },
  { say: "shell", choices: ["shall", "sell", "shell", "smell"], answer: 2, level: 1.2 },
  { say: "moon", choices: ["noon", "moan", "spoon", "moon"], answer: 3, level: 1.3 },
  { say: "thick", choices: ["tick", "thick", "chick", "thin"], answer: 1, level: 1.3 },
  { say: "frog", choices: ["frog", "fog", "frock", "from"], answer: 0, level: 1.4 },
  { say: "queen", choices: ["queen", "seen", "green", "keen"], answer: 0, level: 1.4 },
  { say: "rain", choices: ["ran", "rain", "train", "rail"], answer: 1, level: 1.5 },
  { say: "boat", choices: ["bat", "beat", "boat", "bait"], answer: 2, level: 1.5 },
  { say: "light", choices: ["light", "lit", "late", "lot"], answer: 0, level: 1.5 },
  { say: "night", choices: ["nut", "night", "net", "neat"], answer: 1, level: 1.6 },
  { say: "stamp", choices: ["stomp", "stamp", "stump", "damp"], answer: 1, level: 1.6 },
  { say: "cake", choices: ["cap", "cane", "coke", "cake"], answer: 3, level: 1.8 },
  { say: "bike", choices: ["bike", "bake", "back", "like"], answer: 0, level: 1.8 },
  { say: "chair", choices: ["cheer", "chain", "chair", "share"], answer: 2, level: 1.8 },
  { say: "coin", choices: ["corn", "coin", "cone", "cane"], answer: 1, level: 1.8 },
  { say: "home", choices: ["hum", "hole", "home", "hope"], answer: 2, level: 2.0 },
  { say: "tube", choices: ["tub", "tube", "cube", "tune"], answer: 1, level: 2.0 },
  { say: "string", choices: ["sting", "strong", "spring", "string"], answer: 3, level: 2.0 },
  { say: "crown", choices: ["crow", "crane", "crown", "clown"], answer: 2, level: 2.0 },
  { say: "purse", choices: ["pass", "purse", "piece", "pose"], answer: 1, level: 2.2 },
  { say: "splash", choices: ["split", "splash", "flash", "slash"], answer: 1, level: 2.3 },
  { say: "phone", choices: ["phone", "fan", "foam", "fine"], answer: 0, level: 2.5 },
  { say: "scratch", choices: ["scrap", "scotch", "stretch", "scratch"], answer: 3, level: 2.5 },
];

// ---------------------------------------------------------------------------
// WRITING PROMPTS (3 per band)
// ---------------------------------------------------------------------------

export const WRITING_PROMPTS: WritingPrompt[] = [
  // Band 1, read aloud by the teacher in a live call; child writes on paper and holds it to the camera.
  {
    id: "b1-favourite-animal",
    band: 1,
    title: "My Favourite Animal",
    prompt: "Think of an animal you really like. Write a sentence that tells me what it is and one thing it can do. If you can, write another sentence that tells me why you like it.",
    purpose: "description",
    audience: "your teacher",
    minutes: 8,
    guide: "Secure: 1–3 sentences with capital letters and full stops, phonically plausible spelling, common words (the, is, my, like) correct, and perhaps 'and' or 'because' to join ideas.",
  },
  {
    id: "b1-fun-day",
    band: 1,
    title: "A Fun Day Out",
    prompt: "Think about a time you went somewhere fun, like the park, the beach or a friend's house. Write a sentence about where you went and what you did there.",
    purpose: "recount",
    audience: "your teacher",
    minutes: 8,
    guide: "Secure: a short recount in the past tense ('I went…'), mostly correct sentence punctuation, letters formed and spaced, and spelling that can be read back easily.",
  },
  {
    id: "b1-sandwich",
    band: 1,
    title: "How to Make a Sandwich",
    prompt: "Your friend wants to make your favourite sandwich. Write one or two sentences telling them what to do. Start your first sentence with 'First'.",
    purpose: "instruction",
    audience: "a friend",
    minutes: 8,
    guide: "Secure: uses 'First' and perhaps 'then' or 'next', gives commands in a sensible order, and uses capital letters and full stops in most sentences.",
  },

  // Band 2
  {
    id: "b2-tiny-door",
    band: 2,
    title: "The Tiny Door",
    prompt: "One morning, you find a tiny wooden door at the bottom of a tree in your garden. Write a story about what happens when you open it. Think about how your story begins, what goes on behind the door and how it ends.",
    purpose: "narrative",
    audience: "children of your age",
    minutes: 15,
    guide: "Secure Y3–4: a clear beginning, middle and end, paragraphs or clear sections, some speech in inverted commas, varied conjunctions (when, because, so) and a few well-chosen adjectives.",
  },
  {
    id: "b2-pen-friend",
    band: 2,
    title: "Letter to a Pen Friend",
    prompt: "You have a new pen friend who lives in another country. Write a letter introducing yourself: describe your home, your family or friends, and the things you most enjoy doing. Ask your pen friend at least one question.",
    purpose: "letter",
    audience: "a pen friend in another country",
    minutes: 15,
    guide: "Secure Y3–4: letter layout (greeting and sign-off), ideas grouped into paragraphs, a question correctly punctuated, mostly accurate tense and spelling of common words.",
  },
  {
    id: "b2-plant-care",
    band: 2,
    title: "Looking After a Plant",
    prompt: "Write a short guide for a younger child explaining how to look after a plant so that it stays healthy. Include what the plant needs and the steps they should follow.",
    purpose: "explanation",
    audience: "a younger child",
    minutes: 15,
    guide: "Secure Y3–4: an introduction, steps in order with time words or numbers, imperative verbs, reasons using 'because' or 'so that', and a heading or subheadings.",
  },

  // Band 3
  {
    id: "b3-busy-market",
    band: 3,
    title: "The Busy Market",
    prompt: "Describe a busy market at its busiest moment. Help your reader see, hear, smell and feel what it is like to be there. You may describe a real market you have visited or an imagined one.",
    purpose: "description",
    audience: "readers of a school anthology",
    minutes: 20,
    guide: "Secure Y5–6: vivid expanded noun phrases, at least one simile or metaphor, varied sentence openings including fronted adverbials with commas, and cohesive paragraphs that move through the scene.",
  },
  {
    id: "b3-lunch-break",
    band: 3,
    title: "A Longer Lunch Break?",
    prompt: "Your school council is deciding whether lunch break should be ten minutes longer. Write a speech to persuade the council to agree with your view. Give reasons and try to answer what the other side might say.",
    purpose: "persuasion",
    audience: "the school council",
    minutes: 20,
    guide: "Secure Y5–6: a clear viewpoint, several reasons developed with evidence or examples, persuasive devices (rhetorical question, modal verbs), a counter-argument addressed, and a strong conclusion.",
  },
  {
    id: "b3-young-inventor",
    band: 3,
    title: "The Young Inventor",
    prompt: "Write a story about a young inventor whose new invention does not work in the way they expected. What did they build, what went wrong, and what did they learn?",
    purpose: "narrative",
    audience: "children of your age",
    minutes: 20,
    guide: "Secure Y5–6: a structured plot with a problem and resolution, character shown through speech and action, accurately punctuated dialogue, relative clauses and a range of punctuation used for effect.",
  },

  // Band 4
  {
    id: "b4-screens-at-dinner",
    band: 4,
    title: "Screens at the Dinner Table",
    prompt: "'Phones and tablets should be banned at the family dinner table.' Write an article for your school magazine giving your views on this statement.",
    purpose: "persuasion",
    audience: "readers of a school magazine",
    minutes: 25,
    guide: "Secure Y7–9: an engaging headline and opening, a sustained argument with balanced counter-points, deliberate paragraphing and discourse markers, ambitious vocabulary and accurate use of semi-colons or colons.",
  },
  {
    id: "b4-how-it-works",
    band: 4,
    title: "How It Works",
    prompt: "Choose a process you understand well – for example, the water cycle, how a bicycle's gears work or how bread rises. Explain it clearly for a pupil two years younger than you.",
    purpose: "explanation",
    audience: "a pupil two years younger",
    minutes: 25,
    guide: "Secure Y7–9: logically sequenced paragraphs, accurate technical vocabulary explained for the audience, causal connectives (as a result, consequently), an impersonal tone and a concluding summary.",
  },
  {
    id: "b4-a-sound",
    band: 4,
    title: "A Story That Begins with a Sound",
    prompt: "Write the opening of a story set in a place you have never been. Your first sentence must describe a sound.",
    purpose: "narrative",
    audience: "readers of your age",
    minutes: 25,
    guide: "Secure Y7–9: a crafted opening that builds atmosphere, controlled pace (varied sentence lengths, including short sentences for effect), sensory imagery and a clear sense of character and setting.",
  },

  // Band 5
  {
    id: "b5-opportunities-speech",
    band: 5,
    title: "More Opportunities Than Ever?",
    prompt: "'Young people today have more opportunities than any generation before them.' Write a speech for a school debate in which you argue for or against this statement.",
    purpose: "argument",
    audience: "a school debate audience",
    minutes: 25,
    guide: "Secure Y10–11: a sophisticated, well-structured argument with a clear line of reasoning, counter-arguments rebutted, rhetorical devices used with control, a confident tone and very few technical errors.",
  },
  {
    id: "b5-two-times",
    band: 5,
    title: "One Place, Two Times",
    prompt: "Describe the same place at two different times – for example, a railway station at dawn and late at night, or a beach in summer and in winter. Show how the mood of the place changes.",
    purpose: "description",
    audience: "readers of a creative writing anthology",
    minutes: 25,
    guide: "Secure Y10–11: a deliberate structure contrasting the two times, precise and original imagery, a shift in mood carried by language choices, varied sentence forms and accurate, ambitious punctuation.",
  },
  {
    id: "b5-council-letter",
    band: 5,
    title: "A Letter to the Council",
    prompt: "Write a formal letter to your local council proposing one improvement to your area – such as a new park, safer cycle routes or a community library. Explain why it is needed and how it would benefit residents.",
    purpose: "letter",
    audience: "the local council",
    minutes: 25,
    guide: "Secure Y10–11: correct formal letter conventions, a formal and courteous register throughout, a persuasive proposal supported by specific reasons, well-linked paragraphs and accurate Standard English.",
  },
];
