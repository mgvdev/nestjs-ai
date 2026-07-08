import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Persisted conversation message. Register this entity in your TypeORM
 * `DataSource` (`entities: [ConversationMessageEntity]`) and wire
 * `TypeOrmConversationStore` as the module's `conversationStore`.
 */
@Entity('ai_conversation_messages')
export class ConversationMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column()
  conversationId!: string;

  @Column()
  role!: string;

  /** Message content stored as JSON to preserve structured parts. */
  @Column({ type: 'simple-json' })
  content!: unknown;

  @Column({ type: 'bigint' })
  position!: number;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
