export type ExpectationGroup = {
  title: string;
  items: string[];
};

export type RepresentEachOtherWellContent = {
  intro: string;
  groups: ExpectationGroup[];
  footnote: string;
  scripture: string;
};

export type WeekPoi = {
  leaders: string[];
  followers: string[];
  both: string[];
};

export type InstructorWeek = {
  id: "a" | "b" | "c";
  label: string;
  bigPictureTitle: string;
  moves: string[];
  poi: WeekPoi;
  videoUrl: string | null;
  videoOnRight: boolean;
};

export type InstructorVideosContent = {
  subtitle: string;
  weeks: InstructorWeek[];
};

const sharedMoves = [
  "Behind the Back (BHB)",
  "Right Side Pass (RSP) / Under Arm Pass (UAP)",
  "Hair Whip",
  "Dip",
];

const sharedPoi: WeekPoi = {
  leaders: ["Left of Follow", "Footwork (LRL, RLR)"],
  followers: ["Replace the Leader"],
  both: ["QQS"],
};

export const representEachOtherWell: RepresentEachOtherWellContent = {
  intro:
    "As part of the CCS team, you represent yourself, each other and CCS as a whole. We trust you to do that well and help create the culture we all want to see. Below is a summary of team expectations and FAQ's.",
  groups: [
    {
      title: "On Tuesdays & Our Events",
      items: [
        "Wear your CCS shirt when teaching or on door",
        "Take classes in different roles and levels",
        "Help the room run well: crowd control, group photos, quiet during recaps, etc.",
        "Dance with everyone (especially newbies)",
        "Bring new folks into steal circles",
        "Share CCS event posts to your socials",
      ],
    },
    {
      title: "Teaching in Nashville",
      items: [
        "Yes, you can totally give privates",
        "Yes, you can absolutely teach workshops",
        "Please tell us if you have a gig in or around Nashville*",
        "If it's not CCS sanctioned, please don't wear CCS merch.",
      ],
    },
    {
      title: "Volunteering/Teaching",
      items: [
        "Please start with one lesson spot per month",
        "Pick up additional spots after everyone has a chance to grab at least one",
      ],
    },
    {
      title: "Out in the Dance World",
      items: [
        "Remember you're independent but you also represent CCS/the whole team!",
        "Be yourself, have fun and represent yourself, your teammates, and this community well!",
      ],
    },
  ],
  footnote:
    "*We want to support you in any and every way possible. That includes helping you promote, make connections, pushing gigs your way, etc. Good communication is key for this!",
  scripture:
    '"Therefore encourage one another and build each other up, just as in fact you are doing." — 1 Thes 5:11',
};

export const instructorVideos: InstructorVideosContent = {
  subtitle: "Recap videos and reference tools for Weeks A, B, and C",
  weeks: [
    {
      id: "a",
      label: "WEEK A",
      bigPictureTitle: "BIG PICTURE - Open Position Basics",
      moves: sharedMoves,
      poi: sharedPoi,
      videoUrl: null,
      videoOnRight: false,
    },
    {
      id: "b",
      label: "WEEK B",
      bigPictureTitle: "BIG PICTURE - Closed Position Basics",
      moves: sharedMoves,
      poi: sharedPoi,
      videoUrl: null,
      videoOnRight: true,
    },
    {
      id: "c",
      label: "WEEK C",
      bigPictureTitle: "BIG PICTURE - Post, Connection, Stretch & Line of Dance",
      moves: ["Rubber Band Drill", "Intermediate Open Position", "Free Spin", "Slingshot with RSP", "Slingshot with Hip Catch"],
      poi: {
        leaders: ["Set the Post"],
        followers: ["Respond to the Post"],
        both: ["Stretch Away from the Post", "QQS"],
      },
      videoUrl: null,
      videoOnRight: false,
    },
  ],
};
