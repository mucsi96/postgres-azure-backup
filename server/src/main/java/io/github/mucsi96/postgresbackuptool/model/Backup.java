package io.github.mucsi96.postgresbackuptool.model;

import java.time.Instant;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class Backup {
  String name;
  Instant lastModified;
  long size;
  int totalRowCount;
  int retentionPeriod;
  private boolean hasPlainDump;
  @Builder.Default
  private int fileCount = 0;
  @Builder.Default
  private long filesTotalSize = 0;
}
