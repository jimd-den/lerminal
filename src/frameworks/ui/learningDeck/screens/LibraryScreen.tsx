import React from "react";
import { ScrollView, Text, View } from "react-native";
import { LearningDeckModel } from "../../../../adapters/presenters/LearningDeckPresenter";
import { SectionLabel, Slab, SystemHeader } from "../components";
import { LearningTheme } from "../theme";
import { EmptyReadout } from "./shared";
import { styles } from "./screenStyles";

export function LibraryScreen({
  theme,
  model,
  onOpenSpace,
}: {
  theme: LearningTheme;
  model: LearningDeckModel;
  onOpenSpace: (spaceId: string) => void;
}) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <SystemHeader
        eyebrow="LEARNIMAL // LIBRARY"
        title="Learning spaces"
        theme={theme}
      />
      <Text style={[styles.intro, { color: theme.textMuted }]}>
        Each space is a bounded system for its sources, notes, transformations,
        and practice.
      </Text>
      <SectionLabel
        theme={theme}
        code={`${model.spaces.length.toString().padStart(2, "0")} ONLINE`}
      >
        SPACE INDEX
      </SectionLabel>
      {model.spaces.map((space, index) => (
        <Slab
          key={space.id}
          title={space.name}
          label={`${String(index + 1).padStart(2, "0")} // ${space.active ? "ACTIVE" : "STANDBY"}`}
          meta={
            space.active
              ? `${space.materialCount ?? 0} materials // ${space.dueCount ?? 0} due`
              : "Load learning context"
          }
          theme={theme}
          onPress={() => onOpenSpace(space.id)}
        />
      ))}
    </ScrollView>
  );
}

