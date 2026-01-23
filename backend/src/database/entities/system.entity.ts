import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('systems')
@Index(['shortname'])
export class System {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, length: 255 })
  shortname: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  fullname: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  env: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
