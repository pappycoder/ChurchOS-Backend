/**
 * @file index.ts
 * @description Barrel exports for the Pastoral module.
 *
 * @module pastoral
 * @since 1.0.0
 */

// Export the NestJS module definition
export { PastoralModule } from './pastoral.module';
// Export the business logic service for note and life event CRUD
export { PastoralService } from './pastoral.service';
// Export the scoring service for engagement and risk calculations
export { ScoringService } from './scoring.service';
// Export DTOs for creating, updating, listing, and responding with pastoral notes
export { CreatePastoralNoteDto } from './dto/create-pastoral-note.dto';
export { UpdatePastoralNoteDto } from './dto/update-pastoral-note.dto';
export { ListPastoralNotesDto } from './dto/list-pastoral-notes.dto';
export { PastoralNoteResponseDto } from './dto/pastoral-note-response.dto';
// Export DTOs for creating, listing, and responding with life events
export { CreateLifeEventDto } from './dto/create-life-event.dto';
export { ListLifeEventsDto } from './dto/list-life-events.dto';
export { LifeEventResponseDto } from './dto/life-event-response.dto';
