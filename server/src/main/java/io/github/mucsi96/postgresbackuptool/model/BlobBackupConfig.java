package io.github.mucsi96.postgresbackuptool.model;

import com.fasterxml.jackson.annotation.JsonAutoDetect;
import com.fasterxml.jackson.annotation.JsonAutoDetect.Visibility;
import com.fasterxml.jackson.annotation.JsonProperty;

import lombok.Data;

@Data
@JsonAutoDetect(fieldVisibility = Visibility.ANY)
public class BlobBackupConfig {
    @JsonProperty(required = true)
    private String containerName;

    @JsonProperty
    private String prefix = "";
}
