package io.github.mucsi96.postgresbackuptool.controller;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;

import io.github.mucsi96.postgresbackuptool.service.FolderBackupPathException;
import jakarta.validation.ConstraintViolationException;

@ControllerAdvice
public class AppControllerAdvice {

  @ExceptionHandler(ConstraintViolationException.class)
  public ResponseEntity<Void> handleConstraintViolation() {
    return ResponseEntity.badRequest().build();
  }

  @ExceptionHandler(FolderBackupPathException.class)
  public ResponseEntity<Map<String, String>> handleFolderBackupPath(FolderBackupPathException ex) {
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
        .body(Map.of("message", ex.getMessage()));
  }
}
