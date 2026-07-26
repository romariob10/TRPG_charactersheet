import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "mycharacter" });

export type MyCharacterEvents = {
  "catalog/requested": {
    data: {
      templateId: string;
      userId: string;
      jobId?: string;
      characterId?: string;
    };
  };
};
